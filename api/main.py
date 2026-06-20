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
    HealthResponse,
    LowReviewFeatures,
    ModelInfo,
    OrderFeatures,
    PredictionResponse,
)

_registry = registry.Registry()

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


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest) -> AskResponse:
    """Ask the AI copilot a grounded question about the data or model predictions.

    The copilot retrieves context, calls the prediction models as tools when a
    question is order-specific, and returns a grounded answer plus any model
    results it used. The AI dependencies (litellm, chromadb) are imported lazily
    so the slim serving image still serves the /predict endpoints without them.
    """
    try:
        from ai import copilot
    except ImportError as exc:  # pragma: no cover - only when AI deps absent
        raise HTTPException(
            status_code=503,
            detail="AI copilot dependencies are not installed in this deployment. "
            "Install the full requirements.txt to enable /ask.",
        ) from exc

    result = copilot.answer(request.question, order=request.order)
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
