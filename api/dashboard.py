"""Dashboard data: load orders from the warehouse, score them, and aggregate.

Powers the web app's dashboard and order drill-down. The full feature table is
read once, a reasonable sample of delivered orders is scored with both
calibrated models, and the result (summary metrics, distributions, time series,
and the scored sample) is cached in memory so repeat requests are cheap.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import create_engine

from api import registry
from pipeline import config

ROOT = Path(__file__).resolve().parent.parent
SHAP_PATH = ROOT / "reports" / "shap_delay.json"

SAMPLE_SIZE = 400
RANDOM_STATE = 42
_RISK_BINS = [-0.01, 0.1, 0.2, 0.3, 0.5, 1.01]
_RISK_LABELS = ["0–10%", "10–20%", "20–30%", "30–50%", "50%+"]

# In-memory cache; populated on first request.
_CACHE: dict = {}


def _to_bool(s: pd.Series) -> pd.Series:
    mapping = {True: True, False: False, "True": True, "False": False,
               1: True, 0: False, 1.0: True, 0.0: False}
    return s.map(lambda v: mapping.get(v, pd.NA)).astype("boolean")


def _load_frame() -> pd.DataFrame:
    """Feature table joined with the delivery/display columns the UI needs."""
    engine = create_engine(config.DATABASE_URL)
    feats = pd.read_sql_table(config.FEATURES_TABLE, engine)
    orders = pd.read_sql_table(config.ORDERS_TABLE, engine)
    feats.columns = [str(c) for c in feats.columns]
    orders.columns = [str(c) for c in orders.columns]
    # order_status already lives on the feature table; pull only what's missing.
    extra = [
        "order_id", "order_purchase_timestamp", "actual_delivery_days",
        "delivery_vs_estimate_days", "review_score",
    ]
    df = feats.merge(orders[extra], on="order_id", how="left")
    df["is_late"] = _to_bool(df["is_late"])
    df["is_late_int"] = df["is_late"].map(
        lambda v: 1.0 if v is True else (0.0 if v is False else np.nan)
    )
    return df


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
    df = _load_frame()
    delivered = df[df["order_status"] == "delivered"].copy()
    n_total = int(len(df))
    n_delivered = int(len(delivered))

    sample = delivered.sample(min(SAMPLE_SIZE, n_delivered), random_state=RANDOM_STATE).reset_index(drop=True)
    delay_p, delay_thr = _score(sample, reg, "delay")
    lr_p, lr_thr = _score(sample, reg, "low_review")

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
        feature_cols = sorted(set(reg.get("delay").numeric + reg.get("delay").categorical
                                  + reg.get("low_review").numeric + reg.get("low_review").categorical))
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
        "orders_over_time": _orders_over_time(df["order_purchase_timestamp"]),
        "orders": orders,
    }
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
