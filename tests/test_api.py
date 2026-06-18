"""API tests using FastAPI's TestClient (runs the app in-process).

Skipped if the model artifacts haven't been trained yet.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app

ARTIFACTS = Path(__file__).resolve().parent.parent / "models" / "artifacts"
HAVE_ARTIFACTS = (ARTIFACTS / "delay_model.joblib").exists()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.skipif(not HAVE_ARTIFACTS, reason="models not trained")
def test_predict_delay(client):
    r = client.post("/predict/delay", json={
        "order_purchase_timestamp": "2018-03-10T14:00:00",
        "estimated_delivery_days": 25.0,
        "n_items": 1, "total_price": 120.0, "total_freight": 20.0,
        "customer_seller_distance_km": 900.0,
        "customer_state": "SP", "main_seller_state": "RS",
        "primary_payment_type": "credit_card", "main_category": "furniture_decor",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "delay"
    assert 0.0 <= body["probability"] <= 1.0
    assert isinstance(body["flag"], bool)
    assert body["risk_level"] in {"low", "medium", "high"}


@pytest.mark.skipif(not HAVE_ARTIFACTS, reason="models not trained")
def test_predict_low_review(client):
    r = client.post("/predict/low-review", json={
        "estimated_delivery_days": 15.0,
        "actual_delivery_days": 30.0,
        "delivery_vs_estimate_days": 8.0,
        "is_late_int": 1.0,
        "customer_state": "BA",
    })
    assert r.status_code == 200
    assert 0.0 <= r.json()["probability"] <= 1.0


@pytest.mark.skipif(not HAVE_ARTIFACTS, reason="models not trained")
def test_model_info(client):
    r = client.get("/models/delay")
    assert r.status_code == 200
    assert r.json()["roc_auc"] > 0.5


def test_unknown_model_404(client):
    r = client.get("/models/nonexistent")
    assert r.status_code == 404


def test_extra_field_rejected(client):
    r = client.post("/predict/delay", json={"bogus_field": 1})
    assert r.status_code == 422  # schema forbids extra fields
