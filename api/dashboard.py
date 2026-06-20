"""Dashboard data: load orders from the warehouse, score them, and aggregate.

Powers the web app's dashboard and order drill-down. The full feature table is
read once, a reasonable sample of delivered orders is scored with both
calibrated models, and the result (summary metrics, distributions, time series,
and the scored sample) is cached in memory so repeat requests are cheap.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import bindparam, create_engine, text

from api import registry
from pipeline import config

logger = logging.getLogger("veridian.dashboard")

ROOT = Path(__file__).resolve().parent.parent
SHAP_PATH = ROOT / "reports" / "shap_delay.json"

SAMPLE_SIZE = 400
RANDOM_STATE = 42
_RISK_BINS = [-0.01, 0.1, 0.2, 0.3, 0.5, 1.01]
_RISK_LABELS = ["0–10%", "10–20%", "20–30%", "30–50%", "50%+"]

# Extra delivery/display columns the UI needs that live on the orders table
# rather than the feature table.
_ORDER_EXTRA_COLS = [
    "order_id", "order_purchase_timestamp", "actual_delivery_days",
    "delivery_vs_estimate_days", "review_score",
]

# In-memory cache; populated on first request.
_CACHE: dict = {}


def _to_bool(s: pd.Series) -> pd.Series:
    mapping = {True: True, False: False, "True": True, "False": False,
               1: True, 0: False, 1.0: True, 0.0: False}
    return s.map(lambda v: mapping.get(v, pd.NA)).astype("boolean")


def _in_clause(table: str, columns: str, ids: list[str], engine) -> pd.DataFrame:
    """Read `columns` from `table` for a bounded set of order ids (no full scan
    into memory). Uses an expanding bind param so the id list is parameterised."""
    stmt = (
        text(f'SELECT {columns} FROM "{table}" WHERE order_id IN :ids')
        .bindparams(bindparam("ids", expanding=True))
    )
    return pd.read_sql(stmt, engine, params={"ids": ids})


def _load_sample(engine) -> tuple[pd.DataFrame, int, int]:
    """Read ONLY the rows the dashboard needs, never the full warehouse.

    Returns (sample_df, total_orders, delivered_orders). The sample is a small,
    deterministic draw of delivered orders (so repeat builds are stable); peak
    memory stays a few MB instead of loading ~100k×60 columns into pandas — which
    is what OOM-killed the worker on a 512 MB instance.
    """
    with engine.connect() as conn:
        n_total = int(
            conn.execute(text(f'SELECT count(*) FROM "{config.FEATURES_TABLE}"')).scalar() or 0
        )
        # One lightweight text column for all delivered orders (a few MB), then
        # sample ids in-process so the draw is reproducible across dialects.
        delivered_ids = pd.read_sql(
            text(f'SELECT order_id FROM "{config.FEATURES_TABLE}" WHERE order_status = :s'),
            conn, params={"s": "delivered"},
        )["order_id"].astype(str)

    n_delivered = int(len(delivered_ids))
    k = min(SAMPLE_SIZE, n_delivered)
    if k == 0:
        return pd.DataFrame(), n_total, n_delivered

    sample_ids = delivered_ids.sample(k, random_state=RANDOM_STATE).tolist()

    # Pull the full feature columns for just the sampled rows + the order-level
    # extras, then join in memory (both sides are ≤ k rows).
    sample = _in_clause(config.FEATURES_TABLE, "*", sample_ids, engine)
    extras = _in_clause(
        config.ORDERS_TABLE, ", ".join(_ORDER_EXTRA_COLS), sample_ids, engine
    )
    sample.columns = [str(c) for c in sample.columns]
    extras.columns = [str(c) for c in extras.columns]

    df = sample.merge(extras, on="order_id", how="left")
    # Restore the sampled order so positional scoring lines up deterministically
    # (an IN (...) query does not guarantee row order).
    df = df.set_index("order_id").reindex(sample_ids).reset_index()

    df["is_late"] = _to_bool(df["is_late"])
    df["is_late_int"] = df["is_late"].map(
        lambda v: 1.0 if v is True else (0.0 if v is False else np.nan)
    )
    return df, n_total, n_delivered


def _orders_over_time_from_db(engine) -> list[dict]:
    """Monthly order counts for the time-series chart, reading only the single
    timestamp column (not the whole orders table)."""
    ts = pd.read_sql(
        text(f'SELECT order_purchase_timestamp FROM "{config.ORDERS_TABLE}"'), engine
    )["order_purchase_timestamp"]
    return _orders_over_time(ts)


def _score(df: pd.DataFrame, reg: registry.Registry, name: str):
    """Return (probabilities, threshold) for a model over the whole frame."""
    model = reg.get(name)
    X = df[model.numeric + model.categorical].copy()
    for col in model.categorical:
        X[col] = X[col].astype(object)
    proba = model.pipeline.predict_proba(X)[:, 1]
    return proba, float(model.threshold)


def _orders_over_time(orders_ts: pd.Series) -> list[dict]:
    ts = pd.to_datetime(orders_ts, errors="coerce").dropna()
    monthly = ts.dt.to_period("M").value_counts().sort_index()
    # Trim sparse head/tail months that distort the chart.
    out = [{"month": str(p), "orders": int(n)} for p, n in monthly.items() if n >= 20]
    return out


def _distribution(delay: np.ndarray, low_review: np.ndarray) -> list[dict]:
    d = pd.cut(delay, bins=_RISK_BINS, labels=_RISK_LABELS).value_counts().reindex(_RISK_LABELS, fill_value=0)
    r = pd.cut(low_review, bins=_RISK_BINS, labels=_RISK_LABELS).value_counts().reindex(_RISK_LABELS, fill_value=0)
    return [{"bucket": lbl, "delay": int(d[lbl]), "low_review": int(r[lbl])} for lbl in _RISK_LABELS]


def _build(reg: registry.Registry) -> tuple[dict, dict]:
    t0 = time.perf_counter()
    engine = create_engine(config.DATABASE_URL)
    try:
        sample, n_total, n_delivered = _load_sample(engine)
        over_time = _orders_over_time_from_db(engine)
    finally:
        engine.dispose()

    delay_p, delay_thr = _score(sample, reg, "delay")
    lr_p, lr_thr = _score(sample, reg, "low_review")

    feature_cols = sorted(set(
        reg.get("delay").numeric + reg.get("delay").categorical
        + reg.get("low_review").numeric + reg.get("low_review").categorical
    ))

    orders: list[dict] = []
    orders_by_id: dict[str, dict] = {}
    for i, row in sample.iterrows():
        dp, rp = float(delay_p[i]), float(lr_p[i])
        ts = pd.to_datetime(row.get("order_purchase_timestamp"), errors="coerce")
        rec = {
            "order_id": str(row["order_id"]),
            "customer_state": _clean(row.get("customer_state")),
            "main_category": _clean(row.get("main_category")),
            "total_price": _num(row.get("total_price")),
            "n_items": _num(row.get("n_items")),
            "estimated_delivery_days": _num(row.get("estimated_delivery_days")),
            "actual_delivery_days": _num(row.get("actual_delivery_days")),
            "review_score": _num(row.get("review_score")),
            "purchase_date": None if pd.isna(ts) else ts.date().isoformat(),
            "delay_probability": round(dp, 4),
            "delay_risk": registry.risk_level(dp, delay_thr),
            "delay_flag": dp >= delay_thr,
            "low_review_probability": round(rp, 4),
            "low_review_risk": registry.risk_level(rp, lr_thr),
            "low_review_flag": rp >= lr_thr,
        }
        orders.append(rec)
        orders_by_id[rec["order_id"]] = {
            **rec,
            "features": {c: _num_or_str(row.get(c)) for c in feature_cols},
        }

    summary = {
        "total_orders": n_total,
        "delivered_orders": n_delivered,
        "scored_sample": int(len(sample)),
        "delay_at_risk_pct": round(float(np.mean(delay_p >= delay_thr)) * 100, 1),
        "low_review_at_risk_pct": round(float(np.mean(lr_p >= lr_thr)) * 100, 1),
        "high_risk_orders": int(sum(o["delay_risk"] == "high" or o["low_review_risk"] == "high" for o in orders)),
        "avg_delay_probability": round(float(np.mean(delay_p)), 4),
        "delay_threshold": round(delay_thr, 4),
        "low_review_threshold": round(lr_thr, 4),
    }

    payload = {
        "summary": summary,
        "risk_distribution": _distribution(delay_p, lr_p),
        "orders_over_time": over_time,
        "orders": orders,
    }
    logger.info(
        "dashboard built in %.1fs (scored %d of %d delivered / %d total orders)",
        time.perf_counter() - t0, len(sample), n_delivered, n_total,
    )
    return payload, orders_by_id


def _clean(v):
    return None if (v is None or (isinstance(v, float) and pd.isna(v))) else str(v)


def _num(v):
    try:
        f = float(v)
        return None if pd.isna(f) else round(f, 2)
    except (TypeError, ValueError):
        return None


def _num_or_str(v):
    n = _num(v)
    return n if n is not None else _clean(v)


def get_dashboard(reg: registry.Registry) -> dict:
    if "payload" not in _CACHE:
        _CACHE["payload"], _CACHE["orders_by_id"] = _build(reg)
    return _CACHE["payload"]


def get_order(reg: registry.Registry, order_id: str) -> dict | None:
    if "orders_by_id" not in _CACHE:
        get_dashboard(reg)
    record = _CACHE["orders_by_id"].get(order_id)
    if record is None:
        return None
    return {**record, "drivers": _drivers(record["features"])}


def _drivers(features: dict) -> dict:
    """Top model drivers — global SHAP importances (delay), with this order's
    value alongside; the model card's key features for low-review."""
    delay_drivers = []
    if SHAP_PATH.exists():
        shap = json.loads(SHAP_PATH.read_text())
        for item in shap[:6]:
            raw = item["feature"]
            name = raw.split("__", 1)[1] if "__" in raw else raw
            value = features.get(name)
            if value is None and "_" in name:  # one-hot like customer_state_SP
                base, _, suffix = name.rpartition("_")
                value = suffix if str(features.get(base)) == suffix else features.get(base)
            delay_drivers.append({
                "feature": name,
                "importance": round(float(item["mean_abs_shap"]), 4),
                "value": value,
            })
    lr_keys = ["delivery_vs_estimate_days", "actual_delivery_days", "estimated_delivery_days",
               "customer_seller_distance_km", "main_category", "total_freight"]
    low_review_drivers = [{"feature": k, "value": features.get(k)} for k in lr_keys]
    return {"delay": delay_drivers, "low_review": low_review_drivers}
