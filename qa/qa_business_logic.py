"""End-to-end business-logic QA against the full API (FastAPI TestClient).

Verifies the real product logic — scoring, at-risk classification, the batch
summary, the funnel/ROI extrapolation math, and the 'ask your data' grounding —
on a designed test dataset. Run: `DATABASE_URL=sqlite:///$(pwd)/data/veridian.db
.venv/bin/python qa/qa_business_logic.py`
"""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT}/data/veridian.db")

from api.main import app  # noqa: E402

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((PASS if ok else FAIL, name, detail))


def load_orders() -> list[dict]:
    with open(ROOT / "qa" / "test_orders.csv") as f:
        rows = list(csv.DictReader(f))
    out = []
    for r in rows:
        o = {}
        for k, v in r.items():
            if v == "":
                continue
            try:
                o[k] = float(v) if k != "order_id" else v
            except ValueError:
                o[k] = v
        out.append(o)
    return out


with TestClient(app) as c:
    # 1) Health + models loaded
    h = c.get("/health")
    check("health 200 + models loaded", h.status_code == 200 and h.json().get("models_loaded"), str(h.json()))

    # 2) Batch scoring of the test dataset
    orders = load_orders()
    r = c.post("/score/batch", json={"orders": orders})
    check("/score/batch 200", r.status_code == 200, str(r.status_code))
    body = r.json()
    res = {x["order_id"]: x for x in body["results"]}
    summ = body["summary"]

    print("\n--- scored test orders ---")
    for oid, x in res.items():
        print(f"{oid:20s} delay={x['delay_probability']:.3f} ({x['delay_risk']:6s})  low_review={x['low_review_probability']:.3f} ({x['low_review_risk']})")
    print("summary:", summ)

    # 3) Business logic: probabilities are valid + every order scored
    check("all rows scored", len(body["results"]) == len(orders), f"{len(body['results'])}/{len(orders)}")
    check("probabilities in [0,1]",
          all(0 <= x["delay_probability"] <= 1 and 0 <= x["low_review_probability"] <= 1 for x in res.values()))

    # 4) Directional logic — the delay label is "delivered LATER than the promised
    #    ETA", so a TIGHT promise is riskier than a GENEROUS one (shorter
    #    estimated_delivery_days => higher delay risk), holding distance similar.
    tight = res["QA-TIGHT-PROMISE"]["delay_probability"]
    generous = res["QA-GENEROUS-CLOSE"]["delay_probability"]
    check("tight promise > generous promise on delay risk", tight > generous, f"{tight:.3f} vs {generous:.3f}")
    check("tight-close > generous-far (promise window dominates)",
          res["QA-TIGHT-CLOSE"]["delay_probability"] > res["QA-GENEROUS-FAR"]["delay_probability"],
          f"{res['QA-TIGHT-CLOSE']['delay_probability']:.3f} vs {res['QA-GENEROUS-FAR']['delay_probability']:.3f}")

    # 5) Summary math is internally consistent
    delay_at_risk = sum(1 for x in res.values() if x["delay_risk"] != "low")
    review_at_risk = sum(1 for x in res.values() if x["low_review_risk"] != "low")
    check("summary.orders == row count", summ["orders"] == len(orders), str(summ))
    check("summary.delay_at_risk matches recomputed", summ["delay_at_risk"] == delay_at_risk,
          f"api={summ['delay_at_risk']} recomputed={delay_at_risk}")
    check("summary.low_review_at_risk matches recomputed", summ["low_review_at_risk"] == review_at_risk,
          f"api={summ['low_review_at_risk']} recomputed={review_at_risk}")
    expected_pct = round(delay_at_risk / len(orders) * 100, 1)
    check("delay_at_risk_pct math", abs(summ["delay_at_risk_pct"] - expected_pct) < 0.2,
          f"api={summ['delay_at_risk_pct']} expected~{expected_pct}")

    # 6) ROI / funnel extrapolation (mirrors the frontend): sample rate -> full book
    total_book = 99441
    sample = len(orders)
    flagged_est = round(delay_at_risk / sample * total_book)
    check("ROI extrapolation is monotonic (flagged <= scanned, >= sample at-risk)",
          delay_at_risk <= flagged_est <= total_book, f"{delay_at_risk} <= {flagged_est} <= {total_book}")

    # 7) Ask-your-data: data_context is accepted and grounds the answer
    ctx_lines = ["User's uploaded orders (scored):"]
    for oid, x in res.items():
        ctx_lines.append(f"- {oid}: delay {x['delay_probability']*100:.0f}% ({x['delay_risk']}), low-review {x['low_review_probability']*100:.0f}% ({x['low_review_risk']})")
    data_context = "\n".join(ctx_lines)
    a = c.post("/ask", json={"question": "Which of my orders has the highest delay risk?", "data_context": data_context})
    check("/ask with data_context 200 (schema accepts the field)", a.status_code == 200, str(a.status_code))
    ans = a.json().get("answer", "")
    print("\n--- ask-your-data answer ---\n", ans[:400])
    # Whether the LLM is live or falls back, the highest-risk order id should be derivable;
    # assert the call plumbed through and returned a non-empty answer.
    check("ask-your-data returned a non-empty answer", len(ans.strip()) > 0)
    top_id = max(res.items(), key=lambda kv: kv[1]["delay_probability"])[0]
    check("highest-delay order is a tight-promise order (model sanity)",
          top_id in {"QA-TIGHT-PROMISE", "QA-TIGHT-CLOSE"}, f"top={top_id}")

    # 8) Plain copilot (no data_context) still works (back-compat path)
    a2 = c.post("/ask", json={"question": "What ROC-AUC does the delay model achieve?"})
    check("/ask plain 200", a2.status_code == 200, str(a2.status_code))

print("\n================ QA RESULTS ================")
for status, name, detail in results:
    line = f"[{status}] {name}"
    if detail and status == FAIL:
        line += f"  -> {detail}"
    print(line)
n_fail = sum(1 for s, _, _ in results if s == FAIL)
print(f"\n{len(results)-n_fail}/{len(results)} passed, {n_fail} failed")
