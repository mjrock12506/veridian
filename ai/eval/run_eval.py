"""Copilot evaluation harness.

    python -m ai.eval.run_eval

Runs a small set of question/expected-behavior cases against the real copilot
and writes results to ``reports/ai_eval_results.json``.

Why assertion-based instead of DeepEval: DeepEval's metrics (answer relevancy,
faithfulness, etc.) are themselves LLM-judged, so they need a working judge LLM
and add non-determinism. The behaviors that matter here — *did it call the real
model*, *is the answer grounded in retrieved sources*, *did it refuse
out-of-scope* — are checked deterministically below. Two classes of check:

* **Infrastructure checks** (retrieval grounding, tool wiring/probability range)
  do not depend on the LLM and always run.
* **Behavioural checks** (tool actually invoked, refusal, no fabrication) depend
  on a live LLM; if the configured provider is unavailable they are recorded as
  ``skipped`` rather than failed, so the harness is honest about what it tested.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from ai import config, copilot, tools

# Optional pause between cases — gentle on free-tier per-minute token limits.
# Defaults to 0 (no pause) so test/CI runs stay fast.
CASE_DELAY_SECONDS = float(os.environ.get("EVAL_CASE_DELAY_SECONDS", "0"))

CASES_PATH = Path(__file__).resolve().parent / "cases.json"
RESULTS_PATH = config.ROOT / "reports" / "ai_eval_results.json"

_TOOL_FOR_MODEL = {"delay": "predict_delay", "low_review": "predict_low_review"}
_REFUSAL_MARKERS = (
    "can only", "i can help", "outside", "out of scope", "out-of-scope",
    "unable to", "i can't help", "i cannot help", "not able to", "designed to",
    "only answer", "only help",
)
_UNKNOWN_MARKERS = (
    "don't have", "do not have", "not have that", "no information", "not available",
    "don't know", "do not know", "cannot find", "can't find", "isn't in", "is not in",
)


def _check(name: str, ok: bool, *, llm_dependent: bool, llm_available: bool, detail: str = "") -> dict:
    if llm_dependent and not llm_available:
        return {"name": name, "status": "skip", "detail": "LLM unavailable"}
    return {"name": name, "status": "pass" if ok else "fail", "detail": detail}


def _contains_any(text: str, needles: list[str]) -> bool:
    low = text.lower()
    return any(n.lower() in low for n in needles)


def evaluate_case(case: dict) -> dict:
    expect = case.get("expect", {})
    result = copilot.answer(case["question"], order=case.get("order"))
    llm_available = result.error is None
    answer = result.answer or ""
    models_called = [r.get("model") for r in result.model_results]
    checks: list[dict] = []

    # --- Infrastructure checks (LLM-independent) --------------------------- #
    if "sources_any" in expect:
        hit = sorted(set(expect["sources_any"]) & set(result.sources))
        checks.append(_check(
            "retrieval_grounded", bool(hit), llm_dependent=False,
            llm_available=llm_available, detail=f"matched sources: {hit or 'none'}",
        ))
    if "tool_prob_range" in expect and "tool_used" in expect and case.get("order"):
        lo, hi = expect["tool_prob_range"]
        tool_name = _TOOL_FOR_MODEL[expect["tool_used"]]
        out = tools.call_tool(tool_name, case["order"])
        prob = out.get("probability")
        ok = prob is not None and lo <= prob <= hi
        checks.append(_check(
            "model_probability_in_range", ok, llm_dependent=False,
            llm_available=llm_available, detail=f"prob={prob} expected in [{lo},{hi}]",
        ))

    # --- Behavioural checks (need a live LLM) ------------------------------ #
    if "tool_used" in expect:
        ok = expect["tool_used"] in models_called
        checks.append(_check(
            "expected_tool_invoked", ok, llm_dependent=True,
            llm_available=llm_available, detail=f"called: {models_called}",
        ))
    if expect.get("no_tool_used"):
        checks.append(_check(
            "no_tool_invoked", not models_called, llm_dependent=True,
            llm_available=llm_available, detail=f"called: {models_called}",
        ))
    if expect.get("answer_declines"):
        checks.append(_check(
            "declines_out_of_scope", _contains_any(answer, list(_REFUSAL_MARKERS)),
            llm_dependent=True, llm_available=llm_available,
        ))
    if expect.get("answer_not_declines"):
        checks.append(_check(
            "answers_in_scope", not _contains_any(answer, list(_REFUSAL_MARKERS)),
            llm_dependent=True, llm_available=llm_available,
        ))
    if expect.get("answer_admits_unknown"):
        checks.append(_check(
            "admits_unknown", _contains_any(answer, list(_UNKNOWN_MARKERS)),
            llm_dependent=True, llm_available=llm_available,
        ))
    if "answer_contains_any" in expect:
        checks.append(_check(
            "answer_grounded_terms", _contains_any(answer, expect["answer_contains_any"]),
            llm_dependent=True, llm_available=llm_available,
            detail="expected one of: " + ", ".join(expect["answer_contains_any"]),
        ))

    return {
        "id": case["id"],
        "category": case.get("category", ""),
        "question": case["question"],
        "llm_available": llm_available,
        "answer_preview": answer[:200],
        "models_called": models_called,
        "sources": result.sources,
        "checks": checks,
    }


def main() -> int:
    cases = json.loads(CASES_PATH.read_text())
    case_results = []
    for i, case in enumerate(cases):
        if i and CASE_DELAY_SECONDS:
            time.sleep(CASE_DELAY_SECONDS)
        case_results.append(evaluate_case(case))

    all_checks = [chk for cr in case_results for chk in cr["checks"]]
    passed = sum(c["status"] == "pass" for c in all_checks)
    failed = sum(c["status"] == "fail" for c in all_checks)
    skipped = sum(c["status"] == "skip" for c in all_checks)
    llm_available = any(cr["llm_available"] for cr in case_results)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "llm_model": config.LLM_MODEL,
        "llm_available": llm_available,
        "n_cases": len(cases),
        "checks": {"total": len(all_checks), "passed": passed, "failed": failed, "skipped": skipped},
        "overall": "fail" if failed else "pass",
    }
    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(json.dumps({"summary": summary, "cases": case_results}, indent=2))

    print(f"[eval] cases={len(cases)} checks={len(all_checks)} "
          f"pass={passed} fail={failed} skip={skipped} "
          f"(llm_available={llm_available})")
    print(f"[eval] wrote {RESULTS_PATH.relative_to(config.ROOT)}")
    if not llm_available:
        print("[eval] note: LLM-dependent behavioural checks were skipped "
              "(configured provider unavailable); infrastructure checks still ran.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
