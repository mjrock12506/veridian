"""Veridian prediction API (Phase 4 — MLOps serving layer).

FastAPI app exposing one endpoint per prediction service, each returning a
calibrated probability plus a tuned alert flag. Models are loaded once at
startup from models/artifacts/.

Run locally:
    uvicorn api.main:app --reload
Docs: http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("veridian.api")

from api import registry
from api.schemas import (
    AskRequest,
    AskResponse,
    BatchScoreRequest,
    DraftMessageRequest,
    HealthResponse,
    LowReviewFeatures,
    ModelInfo,
    OrderFeatures,
    PredictionResponse,
    WebhookDispatchRequest,
)

# Shared, process-wide registry — the AI copilot's tools reuse this same
# instance, so models are loaded once, not once per subsystem.
_registry = registry.get_shared()

# Allowed browser origins for the web app. Defaults to the Next.js dev server;
# override (comma-separated) with CORS_ORIGINS for other hosts.
_DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    _registry.load()
    yield


app = FastAPI(
    title="Veridian Order Intelligence API",
    description="Predicts delivery-delay risk and customer-dissatisfaction risk "
                "for e-commerce orders (Olist). Probabilities are calibrated.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _predict(model_name: str, payload: dict) -> PredictionResponse:
    try:
        model = _registry.get(model_name)
    except KeyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    X = registry.build_feature_row(payload, model)
    prob = float(model.pipeline.predict_proba(X)[:, 1][0])
    thr = model.threshold
    return PredictionResponse(
        model=model_name,
        probability=round(prob, 4),
        decision_threshold=round(thr, 4),
        flag=prob >= thr,
        risk_level=registry.risk_level(prob, thr),
    )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", models_loaded=_registry.loaded_names)


@app.get("/models/{model_name}", response_model=ModelInfo)
def model_info(model_name: str) -> ModelInfo:
    try:
        m = _registry.get(model_name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ModelInfo(
        name=m.name,
        label_col=m.meta["label_col"],
        positive_base_rate=m.meta["positive_base_rate"],
        roc_auc=m.meta["roc_auc"],
        decision_threshold=m.threshold,
        calibrated=m.meta.get("calibrated", False),
        numeric_features=m.numeric,
        categorical_features=m.categorical,
    )


@app.post("/predict/delay", response_model=PredictionResponse)
def predict_delay(features: OrderFeatures) -> PredictionResponse:
    """Probability that the order is delivered later than its customer estimate."""
    return _predict("delay", features.model_dump())


@app.post("/predict/low-review", response_model=PredictionResponse)
def predict_low_review(features: LowReviewFeatures) -> PredictionResponse:
    """Probability that the customer leaves a low (1–2★) review."""
    return _predict("low_review", features.model_dump())


@app.post("/score/batch")
def score_batch(request: BatchScoreRequest) -> dict:
    """Score a batch of caller-supplied orders (the 'connect your store' flow):
    a calibrated delay + low-review risk per order, plus a portfolio summary."""
    from api import batch

    try:
        return batch.score_orders(_registry, request.orders)
    except KeyError as exc:  # a required model artifact is missing
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # malformed rows etc. — a client problem, not a 500
        logger.exception("Batch scoring failed")
        raise HTTPException(status_code=400, detail=f"Could not score the uploaded orders: {exc}") from exc


@app.post("/draft-message")
def draft_message(request: DraftMessageRequest) -> dict:
    """AI-draft a proactive customer message for an at-risk order (Action Center).
    Always returns a usable message — falls back to a template if the LLM is offline."""
    from ai import messaging

    return messaging.draft(request.order, request.delay_risk or "", request.low_review_risk or "")


def _webhook_url_safe(url: str) -> tuple[bool, str]:
    """Basic SSRF guard: only http(s), no internal/loopback/private targets."""
    import ipaddress
    import socket
    from urllib.parse import urlparse

    try:
        u = urlparse(url)
    except Exception:
        return False, "invalid URL"
    if u.scheme not in ("http", "https"):
        return False, "only http(s) URLs are allowed"
    host = (u.hostname or "").lower()
    if not host or host == "localhost" or host.endswith((".local", ".internal")):
        return False, "internal hosts are not allowed"
    try:
        for info in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False, "private/loopback addresses are not allowed"
    except OSError:
        pass  # let an unresolvable host fail naturally on the request
    return True, ""


@app.post("/integrations/dispatch")
def dispatch_webhook(request: WebhookDispatchRequest) -> dict:
    """Deliver a real action to the caller's own webhook (Slack / Zapier / Make /
    Apps Script / custom). This is the one genuinely-live connector: through a
    Zapier or Make hook it can create a real Gmail draft, append a real Google
    Sheets row, or open a real Zendesk ticket."""
    import json as _json
    import urllib.error
    import urllib.request

    ok, why = _webhook_url_safe(request.url)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Webhook URL rejected: {why}")
    data = _json.dumps(request.payload or {}).encode("utf-8")
    req = urllib.request.Request(
        request.url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310 (scheme checked above)
            text = resp.read(2000).decode("utf-8", "replace")
            return {"ok": True, "status": resp.status, "response": text[:500]}
    except urllib.error.HTTPError as exc:
        detail = exc.read(500).decode("utf-8", "replace") if exc.fp else str(exc)
        return {"ok": False, "status": exc.code, "response": detail[:500]}
    except Exception as exc:  # DNS failure, timeout, refused, …
        raise HTTPException(status_code=502, detail=f"Could not reach the webhook: {exc}") from exc


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest) -> AskResponse:
    """Ask the AI copilot a grounded question about the data or model predictions.

    The copilot retrieves context (a committed TF-IDF corpus), calls the
    prediction models as tools when a question is order-specific, and returns a
    grounded answer plus any model results it used. The AI module is imported
    lazily so a deployment without it still serves the other endpoints.
    """
    try:
        from ai import copilot
    except Exception as exc:  # ImportError/ModuleNotFoundError -> AI layer/deps absent
        # Log the real cause (module + message + traceback) so a deployment that
        # is missing the ai/ package or its deps is diagnosable from the logs.
        logger.exception("AI copilot import failed (missing module: %r)", getattr(exc, "name", None))
        raise HTTPException(
            status_code=503,
            detail="AI copilot dependencies are not installed in this deployment. "
            "Install requirements-api.txt (which now includes the AI deps) to enable /ask.",
        ) from exc

    try:
        result = copilot.answer(
            request.question, order=request.order, data_context=request.data_context
        )
    except Exception as exc:  # surface the real traceback; never hang silently
        logger.exception("AI copilot failed while answering")
        raise HTTPException(status_code=503, detail=f"Copilot error: {exc}") from exc

    # The copilot returns a soft fallback (rather than raising) when the LLM is
    # unavailable; log the underlying cause so it's visible even though we 200.
    if result.error:
        logger.warning("Copilot returned a degraded answer: %s", result.error)
    return AskResponse(**result.to_dict())


@app.get("/dashboard")
def dashboard() -> dict:
    """Summary metrics, risk distribution, orders-over-time, and a scored sample
    of delivered orders for the web dashboard. Computed once and cached."""
    from api import dashboard as dash

    try:
        return dash.get_dashboard(_registry)
    except FileNotFoundError as exc:
        logger.exception("Dashboard build failed: warehouse database not found")
        raise HTTPException(
            status_code=503,
            detail="Warehouse database not found. Run `python -m pipeline.run` first.",
        ) from exc
    except Exception as exc:  # log the full traceback, return a clear 503 (never hang)
        logger.exception("Dashboard build failed")
        raise HTTPException(status_code=503, detail=f"Dashboard data unavailable: {exc}") from exc


@app.get("/orders/{order_id}")
def order_detail(order_id: str) -> dict:
    """Drill-down for a single scored order: risks plus key drivers."""
    from api import dashboard as dash

    try:
        record = dash.get_order(_registry, order_id)
    except Exception as exc:  # the first call may build the cache (same DB read)
        logger.exception("Order detail build failed for %s", order_id)
        raise HTTPException(status_code=503, detail=f"Order data unavailable: {exc}") from exc
    if record is None:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' not in the scored sample.")
    return record


@app.get("/segments")
def segments() -> dict:
    """Customer value × loyalty segments with a recommended retention action each,
    plus spend-tier, category, and geographic breakdowns. Computed once, cached."""
    from api import segments as seg

    try:
        return seg.get_segments()
    except Exception as exc:  # warehouse missing/unreadable -> clear 503, never hang
        logger.exception("Segments build failed")
        raise HTTPException(
            status_code=503,
            detail=f"Segments data unavailable: {exc}. Run `python -m pipeline.run` first.",
        ) from exc


@app.get("/forecast")
def forecast() -> dict:
    """Monthly order volume with a transparent trend-based projection. Cached."""
    from api import forecast as fc

    try:
        return fc.get_forecast()
    except Exception as exc:
        logger.exception("Forecast build failed")
        raise HTTPException(
            status_code=503,
            detail=f"Forecast data unavailable: {exc}. Run `python -m pipeline.run` first.",
        ) from exc
