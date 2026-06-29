"""AI-drafted customer intervention messages for at-risk orders.

Powers the Action Center: given an order the risk models flagged, the LLM writes
a short, warm, proactive message the ops team can send the customer to get ahead
of a likely late delivery or a poor experience. Degrades to a sensible template
when the LLM is offline, so the feature always returns something usable.
"""

from __future__ import annotations

import logging

from ai import config, llm

logger = logging.getLogger("veridian.messaging")

_SYSTEM = (
    "You are a customer-operations assistant for an e-commerce team. Given an order "
    "that a risk model flagged, write a SHORT (2-3 sentences), warm, professional "
    "message the team can send the customer to get ahead of the problem. Tailor it to "
    "the risk (a likely late delivery, or a likely poor experience). Never invent facts "
    "like tracking numbers or dates. No subject line and no placeholders. Plain text only."
)


def _template(delay_risk: str, low_review_risk: str) -> str:
    if delay_risk in ("high", "medium"):
        return (
            "Hi! We're keeping a close eye on your recent order to make sure it reaches "
            "you as quickly as possible. If anything changes we'll let you know right "
            "away — and you can reply here any time. Thanks so much for your patience!"
        )
    if low_review_risk in ("high", "medium"):
        return (
            "Hi! Thank you for your order — we want to be sure you're completely happy "
            "with it. If anything isn't quite right, just reply and we'll make it right "
            "straight away. We really appreciate your business!"
        )
    return (
        "Hi! Thanks for your order — it's on track. We're here if you need anything at "
        "all, so don't hesitate to reach out. We appreciate you!"
    )


def draft(order: dict | None, delay_risk: str, low_review_risk: str) -> dict:
    """Return {message, source, ...}. Never raises — falls back to a template."""
    risks = []
    if delay_risk:
        risks.append(f"delivery-delay risk: {delay_risk}")
    if low_review_risk:
        risks.append(f"low-review (dissatisfaction) risk: {low_review_risk}")
    facts = ", ".join(f"{k}={v}" for k, v in (order or {}).items() if v not in (None, ""))
    user = (
        f"Order risk — {'; '.join(risks) or 'unknown'}.\n"
        f"Known order facts: {facts or '(minimal)'}.\n"
        "Write the proactive customer message."
    )
    try:
        resp = llm.chat(
            [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}],
            max_tokens=180,
            temperature=0.4,
            max_retries=1,  # latency-sensitive: fall back to the template fast, don't wait out a backoff
        )
        text = (resp.choices[0].message.content or "").strip()
        if not text:
            raise llm.LLMUnavailable("empty completion")
        return {"message": text, "source": "ai", "llm_model": config.LLM_MODEL}
    except Exception as exc:  # LLM offline / quota / error -> always return something
        logger.warning("draft message via LLM failed (%s); using template", exc)
        return {
            "message": _template(delay_risk, low_review_risk),
            "source": "template",
            "error": str(exc),
        }
