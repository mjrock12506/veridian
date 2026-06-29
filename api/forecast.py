"""Demand forecast: monthly order volume plus a transparent naive projection.

Reads only the purchase-timestamp column, counts orders per month, then projects
the next few months with a plain least-squares trend fit on the trailing window.
This is deliberately a simple, honest baseline (clearly labelled as such) rather
than a production forecasting model — in keeping with the project's preference
for methods you can explain. A ±1.96σ band from the fit residuals communicates
uncertainty. Result is cached in memory.
"""

from __future__ import annotations

import logging
import time

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from pipeline import config

logger = logging.getLogger("veridian.forecast")

HORIZON = 6          # months to project forward
WINDOW = 9           # trailing months used to fit the trend
_MIN_MONTH_ORDERS = 50  # drop sparse collection-artifact months at the edges

_CACHE: dict = {}


def _monthly(engine) -> pd.Series:
    ts = pd.read_sql(
        text(f'SELECT order_purchase_timestamp FROM "{config.ORDERS_TABLE}"'), engine
    )["order_purchase_timestamp"]
    ts = pd.to_datetime(ts, errors="coerce").dropna()
    monthly = ts.dt.to_period("M").value_counts().sort_index()
    return monthly[monthly >= _MIN_MONTH_ORDERS]


def _build() -> dict:
    t0 = time.perf_counter()
    engine = create_engine(config.DATABASE_URL)
    try:
        monthly = _monthly(engine)
    finally:
        engine.dispose()

    if len(monthly) < 4:
        raise ValueError("not enough monthly history to forecast")

    periods = list(monthly.index)
    values = monthly.to_numpy(dtype=float)
    n = len(values)

    # Least-squares trend on the trailing window.
    w = min(WINDOW, n)
    y = values[-w:]
    x = np.arange(w)
    slope, intercept = np.polyfit(x, y, 1)
    resid = y - (slope * x + intercept)
    resid_std = float(resid.std(ddof=1)) if w > 2 else 0.0
    band = max(1.96 * resid_std, 0.08 * float(y.mean()))  # keep a visible floor

    # Combined series: history (actual) + projection (forecast + band). The last
    # actual point is also seeded as a forecast point so the two lines connect.
    series: list[dict] = [
        {"month": str(p), "actual": int(v), "forecast": None, "lower": None, "upper": None}
        for p, v in zip(periods, values)
    ]
    series[-1] |= {"forecast": int(values[-1]), "lower": int(values[-1]), "upper": int(values[-1])}

    forecast_pts: list[int] = []
    for i in range(1, HORIZON + 1):
        yhat = float(slope * (w - 1 + i) + intercept)
        yhat = max(0.0, yhat)
        lo = max(0.0, yhat - band)
        hi = yhat + band
        forecast_pts.append(int(round(yhat)))
        series.append(
            {
                "month": str(periods[-1] + i),
                "actual": None,
                "forecast": int(round(yhat)),
                "lower": int(round(lo)),
                "upper": int(round(hi)),
            }
        )

    mom = np.diff(y) / y[:-1]
    summary = {
        "history_months": n,
        "last_month": str(periods[-1]),
        "last_orders": int(values[-1]),
        "horizon_months": HORIZON,
        "next_month": str(periods[-1] + 1),
        "next_orders": forecast_pts[0],
        "projected_total": int(sum(forecast_pts)),
        "avg_mom_growth_pct": round(float(np.mean(mom)) * 100, 1) if len(mom) else 0.0,
        "trend_per_month": int(round(slope)),
        "method": f"Least-squares trend on the last {w} months (illustrative baseline, ±1.96σ band)",
    }

    payload = {"summary": summary, "series": series}
    logger.info("forecast built in %.2fs (%d history months, horizon %d)", time.perf_counter() - t0, n, HORIZON)
    return payload


def get_forecast() -> dict:
    if "payload" not in _CACHE:
        _CACHE["payload"] = _build()
    return _CACHE["payload"]
