"""Function-calling tools that bridge the copilot to the prediction models.

The copilot must never *guess* a risk number. When asked to score an order it
calls one of these tools, which runs the actual calibrated model from
``models/artifacts/`` (via the Phase 4 serving registry) and returns the real
probability. The tool schemas below are advertised to the LLM in the
OpenAI-style function-calling format that LiteLLM normalises across providers.
"""

from __future__ import annotations

from functools import lru_cache

from api import registry

# Tool name -> registered model name.
_TOOL_TO_MODEL = {
    "predict_delay": "delay",
    "predict_low_review": "low_review",
}

# Order-time inputs shared by both models. All optional: the serving pipeline
# imputes anything omitted, so the copilot passes only what the user supplied.
# Types are nullable (["<type>", "null"]) because some providers (e.g. Groq)
# strictly validate tool arguments and reject a null for a plain-typed field;
# allowing null lets the model omit unknown features portably.
_STR = ["string", "null"]
_NUM = ["number", "null"]
_ORDER_TIME_PROPERTIES: dict = {
    "order_purchase_timestamp": {
        "type": _STR,
        "description": "ISO 8601 purchase time; calendar features are derived from it.",
    },
    "estimated_delivery_days": {
        "type": _NUM,
        "description": "Days between purchase and the delivery estimate shown to the customer.",
    },
    "approval_delay_hours": {"type": _NUM, "description": "Hours from purchase to payment approval."},
    "n_items": {"type": _NUM, "description": "Number of item lines in the order."},
    "total_price": {"type": _NUM, "description": "Sum of item prices (BRL)."},
    "total_freight": {"type": _NUM, "description": "Sum of freight values (BRL)."},
    "max_installments": {"type": _NUM, "description": "Maximum payment installments."},
    "customer_seller_distance_km": {
        "type": _NUM,
        "description": "Mean customer-to-seller shipping distance in km.",
    },
    "main_category": {"type": _STR, "description": "Dominant product category (English)."},
    "primary_payment_type": {
        "type": _STR,
        "description": "credit_card, boleto, voucher, or debit_card.",
    },
    "customer_state": {"type": _STR, "description": "2-letter Brazilian state, e.g. SP."},
    "main_seller_state": {"type": _STR, "description": "2-letter seller state, e.g. SP."},
}

# Extra post-delivery inputs the low-review model may use.
_POST_DELIVERY_PROPERTIES: dict = {
    "actual_delivery_days": {"type": _NUM, "description": "Days from purchase to delivery."},
    "delivery_vs_estimate_days": {
        "type": _NUM,
        "description": "Delivered minus estimated days; positive means late.",
    },
    "is_late_int": {"type": _NUM, "description": "1 if delivered late, else 0."},
}


TOOL_SPECS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "predict_delay",
            "description": (
                "Return the calibrated probability that an order is delivered later "
                "than its customer estimate, using only order-time features. Use this "
                "for any 'will this be late / delay risk' question."
            ),
            "parameters": {
                "type": "object",
                "properties": _ORDER_TIME_PROPERTIES,
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "predict_low_review",
            "description": (
                "Return the calibrated probability that the customer leaves a low "
                "(1-2 star) review. May use post-delivery features as well as "
                "order-time features. Use this for satisfaction / bad-review questions."
            ),
            "parameters": {
                "type": "object",
                "properties": {**_ORDER_TIME_PROPERTIES, **_POST_DELIVERY_PROPERTIES},
                "additionalProperties": False,
            },
        },
    },
]


@lru_cache(maxsize=1)
def _registry() -> registry.Registry:
    reg = registry.Registry()
    reg.load()
    return reg


def available_tools() -> list[str]:
    """Tool names whose backing model artifact is actually loaded."""
    loaded = set(_registry().loaded_names)
    return [t for t, m in _TOOL_TO_MODEL.items() if m in loaded]


def call_tool(name: str, arguments: dict) -> dict:
    """Run a prediction tool and return a JSON-serialisable result.

    Returns an ``{"error": ...}`` dict (never raises) so the copilot can relay a
    clear message instead of fabricating a number.
    """
    model_name = _TOOL_TO_MODEL.get(name)
    if model_name is None:
        return {"error": f"Unknown tool '{name}'."}

    try:
        model = _registry().get(model_name)
    except KeyError as exc:
        return {"error": str(exc)}

    arguments = arguments or {}
    X = registry.build_feature_row(arguments, model)
    prob = float(model.pipeline.predict_proba(X)[:, 1][0])
    thr = model.threshold
    return {
        "model": model_name,
        "probability": round(prob, 4),
        "decision_threshold": round(thr, 4),
        "flag": bool(prob >= thr),
        "risk_level": registry.risk_level(prob, thr),
        "inputs_used": {k: v for k, v in arguments.items() if v is not None},
    }
