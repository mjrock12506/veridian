"""Pydantic request/response schemas for the Veridian prediction API.

Every feature field is optional: the serving pipeline imputes missing numerics
(median) and unseen categories (most-frequent / one-hot "ignore"), so clients
can send a partial order and still get a calibrated score. A few convenience
fields (``order_purchase_timestamp``) let the API derive calendar/ratio features
the model expects without the client computing them.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class OrderFeatures(BaseModel):
    """Order-time features (known at/just after purchase) for the delay model."""

    model_config = {"extra": "forbid"}

    # Convenience: ISO timestamp the API expands into purchase_* calendar parts.
    order_purchase_timestamp: str | None = Field(
        default=None, description="ISO 8601 purchase time; used to derive calendar features."
    )

    # Numeric order-time features.
    estimated_delivery_days: float | None = None
    approval_delay_hours: float | None = None
    n_items: float | None = None
    n_sellers: float | None = None
    n_products: float | None = None
    total_price: float | None = None
    total_freight: float | None = None
    freight_ratio: float | None = Field(
        default=None, description="Derived from freight/(price+freight) if omitted."
    )
    avg_product_weight_g: float | None = None
    max_product_weight_g: float | None = None
    avg_product_volume_cm3: float | None = None
    max_installments: float | None = None
    n_payments: float | None = None
    customer_seller_distance_km: float | None = None
    purchase_month: float | None = None
    purchase_dow: float | None = None
    purchase_hour: float | None = None
    purchase_is_weekend: float | None = None
    cross_state_shipment: float | None = Field(
        default=None, description="Derived from customer vs seller state if omitted."
    )

    # Categorical order-time features.
    main_category: str | None = None
    primary_payment_type: str | None = None
    customer_state: str | None = None
    main_seller_state: str | None = None


class LowReviewFeatures(OrderFeatures):
    """Adds post-delivery outcome features for the satisfaction model."""

    actual_delivery_days: float | None = None
    delivery_vs_estimate_days: float | None = None
    is_late_int: float | None = Field(
        default=None, description="1 if delivered late, else 0."
    )


class PredictionResponse(BaseModel):
    model: str
    probability: float = Field(description="Calibrated probability of the positive class (0–1).")
    decision_threshold: float = Field(description="Tuned operating threshold for the alert flag.")
    flag: bool = Field(description="True when probability >= decision_threshold.")
    risk_level: str = Field(description="low / medium / high bucket for display.")


class BatchScoreRequest(BaseModel):
    """A batch of caller-supplied orders to score (the 'connect your store' flow).

    Each order is a partial set of order features (same fields as ``OrderFeatures`` /
    ``LowReviewFeatures``); anything omitted is imputed by the model pipelines. An
    optional ``order_id`` on a row is echoed back so callers can match results to
    their own data.
    """

    model_config = {"extra": "forbid"}

    orders: list[dict] = Field(
        default_factory=list,
        description="Orders to score; each a partial mapping of order features (+ optional order_id).",
    )


class DraftMessageRequest(BaseModel):
    """Ask the AI to draft a proactive customer message for an at-risk order."""

    model_config = {"extra": "forbid"}

    order: dict | None = Field(default=None, description="Known order facts for context.")
    delay_risk: str | None = Field(default=None, description="low / medium / high")
    low_review_risk: str | None = Field(default=None, description="low / medium / high")


class AskRequest(BaseModel):
    """A natural-language question for the copilot, with an optional order."""

    model_config = {"extra": "forbid"}

    question: str = Field(description="Natural-language question about the data or models.")
    order: dict | None = Field(
        default=None,
        description="Optional order features the copilot may pass to a prediction tool.",
    )


class AskResponse(BaseModel):
    answer: str = Field(description="Grounded natural-language answer.")
    model_results: list[dict] = Field(
        default_factory=list,
        description="Any calibrated model outputs the copilot called while answering.",
    )
    sources: list[str] = Field(
        default_factory=list, description="Knowledge sources retrieved for grounding."
    )
    llm_model: str = Field(description="The LLM the copilot used (provider/model).")
    tokens: int = Field(default=0, description="Approximate total tokens used.")


class HealthResponse(BaseModel):
    status: str
    models_loaded: list[str]


class ModelInfo(BaseModel):
    name: str
    label_col: str
    positive_base_rate: float
    roc_auc: float
    decision_threshold: float
    calibrated: bool
    numeric_features: list[str]
    categorical_features: list[str]
