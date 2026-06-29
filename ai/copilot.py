"""The Veridian copilot: RAG-grounded, tool-using question answering.

Flow for each question:

1. Retrieve grounded passages from the vector store (:mod:`ai.rag`).
2. Ask the LLM (:mod:`ai.llm`) to answer, advertising the prediction tools.
3. If the model calls a tool, run the real model (:mod:`ai.tools`), feed the
   result back, and let it compose a final grounded answer.

Guardrails are enforced through the system prompt and the orchestration:
- Risk numbers come only from tool calls (the calibrated models), never the LLM.
- Dataset facts must come from the retrieved context; if absent, the copilot
  says it does not have the information instead of inventing it.
- Out-of-scope questions are declined.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field

from ai import config, llm, rag, tools

logger = logging.getLogger("veridian.copilot")

MAX_QUESTION_CHARS = 2000
# Per-passage and total caps on the grounding context. Generous enough that the
# whole committed corpus (~18 KB) fits when RAG_BACKEND="direct" dumps it all in,
# but still a hard ceiling on prompt size / token usage.
_PASSAGE_CHARS = 2600
_CONTEXT_CHAR_BUDGET = 20000

SYSTEM_PROMPT = """You are the Veridian order-intelligence copilot. You help \
e-commerce operations users understand the Olist order dataset and its risk \
models (delivery delay and low-review/dissatisfaction).

Rules you must follow:
1. SCOPE: Only answer questions about the Veridian dataset, its features and \
labels, the prediction models, or how to act on an order's risk. If a question \
is unrelated (general knowledge, coding help, other topics), briefly decline \
and state what you can help with.
2. NEVER invent numbers. For any order-specific risk ("what is the delay risk", \
"will this get a bad review"), you MUST call the appropriate tool and report the \
calibrated probability it returns. Do not estimate a probability yourself.
3. For dataset/statistics questions, use only the figures in the CONTEXT block. \
If the answer is not in the context or available via a tool, say you do not have \
that information — do not guess.
4. Be concise and factual. When you cite a model result, include the calibrated \
probability and whether it crosses the alert threshold.
"""


@dataclass
class CopilotResult:
    answer: str
    model_results: list[dict] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    llm_model: str = config.LLM_MODEL
    tokens: int = 0
    error: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _context_block(passages: list[rag.Passage]) -> str:
    if not passages:
        return "CONTEXT: (no grounded passages retrieved)"
    lines = ["CONTEXT (grounded excerpts; cite these, do not invent figures):"]
    used = 0
    for p in passages:
        snippet = p.text[:_PASSAGE_CHARS].strip()
        used += len(snippet)
        if used > _CONTEXT_CHAR_BUDGET and len(lines) > 1:
            break  # keep the prompt bounded even if the corpus grows
        lines.append(f"- [source: {p.source}] {snippet}")
    return "\n".join(lines)


def _assistant_msg_to_dict(msg) -> dict:
    """Normalise a LiteLLM assistant message (with tool calls) to a dict."""
    out: dict = {"role": "assistant", "content": msg.content or ""}
    tool_calls = getattr(msg, "tool_calls", None)
    if tool_calls:
        out["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.function.name, "arguments": tc.function.arguments},
            }
            for tc in tool_calls
        ]
    return out


# --------------------------------------------------------------------------- #
# Graceful degradation: answer straight from the grounded corpus when the LLM
# is offline (no key, exhausted quota, provider outage) or anything else fails,
# so /ask stays useful and never hard-errors instead of returning 503.
# --------------------------------------------------------------------------- #
_FALLBACK_NOTE = (
    " (Answered from Veridian's knowledge base — the language model is offline right now.)"
)
_STOPWORDS = set(
    "a an the of to in on for and or is are was were be been being what which who how "
    "does do did with from this that these those by as at it its their our your you we "
    "about into can could would should will than then there here when where why".split()
)


def _keywords(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9_]+", (text or "").lower())
            if len(w) > 2 and w not in _STOPWORDS}


def _extractive_answer(question: str, passages: list[rag.Passage], max_chunks: int = 3) -> str:
    """Pull the most question-relevant lines/sentences out of the grounded corpus.

    Backend-agnostic: works over whatever passages were retrieved (the whole
    corpus under the default "direct" backend). Scores candidate lines by keyword
    overlap with the question so a metric/definition question surfaces the exact
    line that answers it, without any LLM call.
    """
    qk = _keywords(question)
    if not qk or not passages:
        return ""
    scored: list[tuple[float, int, str]] = []
    seen: set[str] = set()
    idx = 0
    for p in passages:
        for line in p.text.splitlines():
            for chunk in re.split(r"(?<=[.!?])\s+", line.strip()):
                c = chunk.strip(" -|#*`>").strip()
                # Tidy markdown so table rows / bold read as plain prose.
                c = c.replace("**", "").replace(" | ", " · ").replace("|", " ")
                c = re.sub(r"\s{2,}", " ", c).strip()
                key = c.lower()
                if len(c) < 12 or key in seen:
                    continue
                ck = _keywords(c)
                overlap = len(qk & ck)
                if overlap == 0:
                    continue
                # Reward overlap; lightly favour focused lines over sprawling ones.
                score = overlap + overlap / (1 + len(ck) ** 0.5)
                scored.append((score, idx, c))
                seen.add(key)
                idx += 1
    if not scored:
        return ""
    top = sorted(scored, key=lambda t: (-t[0], t[1]))[:max_chunks]
    top.sort(key=lambda t: t[1])  # present in reading order for coherence
    return " ".join(c for _, _, c in top)[:700].strip()


def _grounded_fallback(
    question: str,
    passages: list[rag.Passage],
    model_results: list[dict],
    sources: list[str],
    tokens: int,
    exc: Exception,
) -> CopilotResult:
    extracted = _extractive_answer(question, passages)
    if extracted:
        answer_text = extracted + _FALLBACK_NOTE
    else:
        answer_text = (
            "The language model is offline right now, so I can't compose a full answer. "
            "You can still ask about the dataset or the model metrics (e.g. ROC-AUC), or "
            "score an order directly on the Score page — the prediction models are live."
        )
    return CopilotResult(
        answer=answer_text,
        model_results=model_results,
        sources=sources or list(dict.fromkeys(p.source for p in passages)),
        tokens=tokens,
        error=str(exc),
    )


def answer(question: str, order: dict | None = None) -> CopilotResult:
    """Answer a natural-language question, grounded in retrieval + tools."""
    question = (question or "").strip()
    if not question:
        return CopilotResult(answer="Please ask a question about the Veridian data or models.")
    if len(question) > MAX_QUESTION_CHARS:
        return CopilotResult(answer="That question is too long; please shorten it.")

    passages = rag.retrieve(question)
    sources = list(dict.fromkeys(p.source for p in passages))

    user_content = question
    if order:
        user_content += f"\n\nStructured order features (use these for any tool call):\n{json.dumps(order)}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": _context_block(passages)},
        {"role": "user", "content": user_content},
    ]

    tool_specs = tools.TOOL_SPECS if tools.available_tools() else None
    model_results: list[dict] = []
    total_tokens = 0

    try:
        for _ in range(config.LLM_MAX_TOOL_ROUNDS):
            resp = llm.chat(messages, tools=tool_specs)
            total_tokens += getattr(getattr(resp, "usage", None), "total_tokens", 0) or 0
            msg = resp.choices[0].message
            tool_calls = getattr(msg, "tool_calls", None)

            if not tool_calls:
                return CopilotResult(
                    answer=(msg.content or "").strip(),
                    model_results=model_results,
                    sources=sources,
                    tokens=total_tokens,
                )

            # Execute each requested tool and feed results back.
            messages.append(_assistant_msg_to_dict(msg))
            for tc in tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                result = tools.call_tool(tc.function.name, args)
                model_results.append(result)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tc.function.name,
                        "content": json.dumps(result),
                    }
                )

        # Tool-round budget exhausted: ask once more for a final answer, no tools.
        resp = llm.chat(messages)
        total_tokens += getattr(getattr(resp, "usage", None), "total_tokens", 0) or 0
        return CopilotResult(
            answer=(resp.choices[0].message.content or "").strip(),
            model_results=model_results,
            sources=sources,
            tokens=total_tokens,
        )

    except llm.LLMUnavailable as exc:
        # Expected degradation (bad key, exhausted quota, provider outage). Log the
        # cause, then answer from the grounded corpus instead of a dead end.
        logger.warning("LLM unavailable (model=%s); answering from the knowledge base: %s",
                       config.LLM_MODEL, exc)
        return _grounded_fallback(question, passages, model_results, sources, total_tokens, exc)
    except Exception as exc:
        # Anything else (tool error, malformed provider response, …): never bubble
        # up to a 503 — degrade to the grounded corpus so /ask stays answerable.
        logger.exception("Copilot answer failed (model=%s); answering from the knowledge base",
                         config.LLM_MODEL)
        return _grounded_fallback(question, passages, model_results, sources, total_tokens, exc)
