"""Customer segments: group buyers by value and loyalty from the warehouse.

Segments customers (the real ``customer_unique_id`` identity, not the per-order
``customer_id``) on two cheap, interpretable axes — lifetime spend and repeat
behaviour — into a value × loyalty grid with a recommended retention action per
cell. Adds spend-tier, category, and geographic breakdowns. Everything is a
single grouped SQL read per aggregate (cheap even at ~100k orders) plus a little
pandas; the result is cached in memory like the dashboard.
"""

from __future__ import annotations

import logging
import time

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from pipeline import config

logger = logging.getLogger("veridian.segments")

# Spend is the customer's lifetime paid value (payment value, falling back to
# item price). One row per real customer.
_CUSTOMER_SQL = f"""
    SELECT customer_unique_id AS cust,
           COUNT(*) AS orders,
           SUM(COALESCE(total_payment_value, total_price, 0)) AS spend
    FROM "{config.ORDERS_TABLE}"
    WHERE customer_unique_id IS NOT NULL
    GROUP BY customer_unique_id
"""

_CATEGORY_SQL = f"""
    SELECT main_category AS category,
           COUNT(*) AS orders,
           SUM(COALESCE(total_payment_value, total_price, 0)) AS revenue
    FROM "{config.ORDERS_TABLE}"
    WHERE main_category IS NOT NULL
    GROUP BY main_category
    ORDER BY revenue DESC
    LIMIT 8
"""

_STATE_SQL = f"""
    SELECT customer_state AS state,
           COUNT(DISTINCT customer_unique_id) AS customers,
           SUM(COALESCE(total_payment_value, total_price, 0)) AS spend
    FROM "{config.ORDERS_TABLE}"
    WHERE customer_state IS NOT NULL
    GROUP BY customer_state
    ORDER BY customers DESC
    LIMIT 8
"""

_VALUE_TIERS = ["Budget", "Standard", "Premium", "VIP"]

_CACHE: dict = {}


def _build() -> dict:
    t0 = time.perf_counter()
    engine = create_engine(config.DATABASE_URL)
    try:
        cust = pd.read_sql(text(_CUSTOMER_SQL), engine)
        by_cat = pd.read_sql(text(_CATEGORY_SQL), engine)
        by_state = pd.read_sql(text(_STATE_SQL), engine)
    finally:
        engine.dispose()

    if cust.empty:
        raise ValueError("no customers in the warehouse")

    cust["spend"] = cust["spend"].fillna(0.0).astype(float)
    cust["orders"] = cust["orders"].astype(int)
    n_cust = int(len(cust))
    n_orders = int(cust["orders"].sum())
    total_spend = float(cust["spend"].sum())

    # Two axes: value (split at the median lifetime spend) and loyalty (repeat).
    median_spend = float(cust["spend"].median())
    high_value = cust["spend"] >= median_spend
    repeat = cust["orders"] > 1

    def _segment(mask, key, name, description, action, tone) -> dict:
        sub = cust[mask]
        n = int(len(sub))
        return {
            "key": key,
            "name": name,
            "description": description,
            "action": action,
            "tone": tone,  # primary | amber | muted — drives the card accent
            "customers": n,
            "share_pct": round(n / n_cust * 100, 1) if n_cust else 0.0,
            "avg_spend": round(float(sub["spend"].mean()), 2) if n else 0.0,
            "avg_orders": round(float(sub["orders"].mean()), 2) if n else 0.0,
            "revenue_share_pct": round(float(sub["spend"].sum()) / total_spend * 100, 1) if total_spend else 0.0,
        }

    segments = [
        _segment(high_value & repeat, "champions", "Champions",
                 "High lifetime spend and more than one order — your best customers.",
                 "Reward loyalty and protect against churn.", "primary"),
        _segment(high_value & ~repeat, "high_value_firsttimers", "High-value first-timers",
                 "Above-median spend, but haven't placed a second order yet.",
                 "Win back with a targeted second-purchase offer.", "amber"),
        _segment(~high_value & repeat, "loyal_regulars", "Loyal regulars",
                 "Repeat buyers at a standard spend level.",
                 "Nurture the relationship and grow basket size.", "primary"),
        _segment(~high_value & ~repeat, "one_time_buyers", "One-time buyers",
                 "A single standard-value order — the long tail.",
                 "Activate: turn the first order into a second.", "muted"),
    ]

    # Spend tiers (quartiles) for a distribution chart. Rank first so equal-spend
    # ties don't collapse the quantile edges.
    tiers = pd.qcut(cust["spend"].rank(method="first"), 4, labels=_VALUE_TIERS)
    value_tiers = [
        {
            "tier": t,
            "customers": int((tiers == t).sum()),
            "revenue_share_pct": round(float(cust.loc[tiers == t, "spend"].sum()) / total_spend * 100, 1)
            if total_spend else 0.0,
        }
        for t in _VALUE_TIERS
    ]

    top_states = [
        {
            "state": str(r.state),
            "customers": int(r.customers),
            "avg_spend": round(float(r.spend) / int(r.customers), 2) if r.customers else 0.0,
        }
        for r in by_state.itertuples()
    ]
    top_categories = [
        {"category": str(r.category), "orders": int(r.orders), "revenue": round(float(r.revenue), 2)}
        for r in by_cat.itertuples()
    ]

    summary = {
        "customers": n_cust,
        "orders": n_orders,
        "repeat_rate_pct": round(float(repeat.mean()) * 100, 1),
        "avg_order_value": round(total_spend / n_orders, 2) if n_orders else 0.0,
    }

    payload = {
        "summary": summary,
        "segments": segments,
        "value_tiers": value_tiers,
        "top_states": top_states,
        "top_categories": top_categories,
    }
    logger.info("segments built in %.2fs (%d customers, %d orders)", time.perf_counter() - t0, n_cust, n_orders)
    return payload


def get_segments() -> dict:
    if "payload" not in _CACHE:
        _CACHE["payload"] = _build()
    return _CACHE["payload"]
