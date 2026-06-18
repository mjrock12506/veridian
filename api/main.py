"""Veridian prediction API (Phase 4 — MLOps serving layer).

FastAPI app exposing one endpoint per prediction service, each returning a
calibrated probability plus a tuned alert flag. Models are loaded once at
startup from models/artifacts/.

Run locally:
    uvicorn api.main:app --reload
Docs: http://127.0.0.1:8000/docs
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from api import registry
from api.schemas import (
    HealthResponse,
    LowReviewFeatures,
    ModelInfo,
    OrderFeatures,
    PredictionResponse,
)

_registry = registry.Registry()


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
