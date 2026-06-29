"""Batch scoring: score a list of caller-supplied orders with both models.

Powers the "Connect your store" page — bring your own orders (CSV / paste) and
get a calibrated delivery-delay and low-review risk for every one, plus a
portfolio summary. Missing feature columns are imputed by the model pipelines,
exactly like the single-order ``/predict`` endpoints, so a partial CSV still
scores. One vectorised ``predict_proba`` per model keeps it fast.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from api import registry

# Bound the work per request (the page is a demo, not a bulk pipeline).
MAX_ORDERS = 1000


def _safe_float(v) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return float("nan")
    return float("nan") if pd.isna(f) else f


def _frame(orders: list[dict], model: registry.LoadedModel) -> pd.DataFrame:
    """Build one DataFrame with the model's columns for all orders at once."""
    rows: list[dict] = []
    for o in orders:
        p = registry._derive(o)
        row: dict[str, object] = {col: _safe_float(p.get(col)) for col in model.numeric}
        for col in model.categorical:
            v = p.get(col)
            row[col] = None if v in (None, "") else str(v)
        rows.append(row)
    return pd.DataFrame(rows, columns=model.numeric + model.categorical)


def _summary(results: list[dict]) -> dict:
    n = len(results)
    delay = sum(r["delay_flag"] for r in results)
    low = sum(r["low_review_flag"] for r in results)
    high = sum(r["delay_risk"] == "high" or r["low_review_risk"] == "high" for r in results)
    return {
        "orders": n,
        "delay_at_risk": delay,
        "low_review_at_risk": low,
        "high_risk": high,
        "delay_at_risk_pct": round(delay / n * 100, 1) if n else 0.0,
        "low_review_at_risk_pct": round(low / n * 100, 1) if n else 0.0,
    }


def score_orders(reg: registry.Registry, orders: list[dict]) -> dict:
    """Score up to ``MAX_ORDERS`` orders with both calibrated models."""
    orders = [o for o in (orders or []) if isinstance(o, dict)][:MAX_ORDERS]
    if not orders:
        return {"results": [], "summary": _summary([])}

    delay, low = reg.get("delay"), reg.get("low_review")
    dp = delay.pipeline.predict_proba(_frame(orders, delay))[:, 1]
    lp = low.pipeline.predict_proba(_frame(orders, low))[:, 1]
    dthr, lthr = delay.threshold, low.threshold

    results: list[dict] = []
    for i, o in enumerate(orders):
        d, l = float(dp[i]), float(lp[i])
        results.append({
            "order_id": str(o.get("order_id") or o.get("id") or f"row-{i + 1}"),
            "delay_probability": round(d, 4),
            "delay_risk": registry.risk_level(d, dthr),
            "delay_flag": bool(d >= dthr),
            "low_review_probability": round(l, 4),
            "low_review_risk": registry.risk_level(l, lthr),
            "low_review_flag": bool(l >= lthr),
        })
    return {"results": results, "summary": _summary(results)}
