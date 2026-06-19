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
from dataclasses import asdict, dataclass, field

from ai import config, llm, rag, tools

MAX_QUESTION_CHARS = 2000
_PASSAGE_CHARS = 600  # truncate each retrieved chunk to keep token use modest

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
    for p in passages:
        snippet = p.text[:_PASSAGE_CHARS].strip()
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
        return CopilotResult(
            answer="The language model is currently unavailable, so I can't generate "
            "an answer right now. The prediction models are still callable directly "
            "via the /predict endpoints.",
            model_results=model_results,
            sources=sources,
            tokens=total_tokens,
            error=str(exc),
        )
