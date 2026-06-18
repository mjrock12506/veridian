"""Shared feature definitions for the Phase 3 models and the Phase 4 API.

Keeping these lists in one place means the training script, the saved model
metadata, and the FastAPI request schemas can't drift apart.

Leakage policy
--------------
The **delay** model may only use features known at (or shortly after) purchase
time — never the delivery outcome it is trying to predict.

The **low-review** model is framed as *post-delivery* (predicting a customer's
satisfaction once their order has arrived), so it additionally uses delivery
outcome features. The review is created after delivery, so this is not leakage.
"""

from __future__ import annotations

# Known at / shortly after purchase — safe for the delay model.
ORDER_TIME_NUMERIC = [
    "estimated_delivery_days",
    "approval_delay_hours",
    "n_items",
    "n_sellers",
    "n_products",
    "total_price",
    "total_freight",
    "freight_ratio",
    "avg_product_weight_g",
    "max_product_weight_g",
    "avg_product_volume_cm3",
    "max_installments",
    "n_payments",
    "customer_seller_distance_km",
    "purchase_month",
    "purchase_dow",
    "purchase_hour",
    "purchase_is_weekend",
    "cross_state_shipment",
]
ORDER_TIME_CATEGORICAL = [
    "main_category",
    "primary_payment_type",
    "customer_state",
    "main_seller_state",
]

# Delivery outcome — available at review time, used only by the low-review model.
DELIVERY_OUTCOME_NUMERIC = [
    "actual_delivery_days",
    "delivery_vs_estimate_days",
    "is_late_int",
]

# Per-model feature sets.
DELAY_NUMERIC = ORDER_TIME_NUMERIC
DELAY_CATEGORICAL = ORDER_TIME_CATEGORICAL

LOWREVIEW_NUMERIC = ORDER_TIME_NUMERIC + DELIVERY_OUTCOME_NUMERIC
LOWREVIEW_CATEGORICAL = ORDER_TIME_CATEGORICAL


def feature_columns(model: str) -> tuple[list[str], list[str]]:
    """Return (numeric, categorical) feature column names for a model name."""
    if model == "delay":
        return DELAY_NUMERIC, DELAY_CATEGORICAL
    if model == "low_review":
        return LOWREVIEW_NUMERIC, LOWREVIEW_CATEGORICAL
    raise ValueError(f"unknown model: {model}")
