"""API tests using FastAPI's TestClient (runs the app in-process).

Skipped if the model artifacts haven't been trained yet.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import app

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "models" / "artifacts"
HAVE_ARTIFACTS = (ARTIFACTS / "delay_model.joblib").exists()
WAREHOUSE = ROOT / "data" / "veridian.db"
HAVE_DB = WAREHOUSE.exists()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def local_warehouse(monkeypatch):
    """Pin the warehouse to the committed local SQLite file so the data-backed
    endpoints are tested hermetically (never the remote DB a local .env may set)."""
    from pipeline import config
    from api import segments, forecast

    monkeypatch.setattr(config, "DATABASE_URL", f"sqlite:///{WAREHOUSE}")
    segments._CACHE.clear()
    forecast._CACHE.clear()


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


@pytest.mark.skipif(not HAVE_DB, reason="warehouse not built")
def test_segments(client, local_warehouse):
    r = client.get("/segments")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["customers"] > 0
    assert 0.0 <= body["summary"]["repeat_rate_pct"] <= 100.0
    keys = {s["key"] for s in body["segments"]}
    assert {"champions", "one_time_buyers"} <= keys
    assert len(body["value_tiers"]) == 4
    # Revenue shares across the four spend tiers should sum to ~100%.
    assert abs(sum(t["revenue_share_pct"] for t in body["value_tiers"]) - 100.0) < 1.0
    assert body["top_categories"] and body["top_states"]


@pytest.mark.skipif(not HAVE_DB, reason="warehouse not built")
def test_forecast(client, local_warehouse):
    r = client.get("/forecast")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["history_months"] >= 4
    assert body["summary"]["horizon_months"] == 6
    # The series carries both actual history and a disjoint forecast tail.
    assert any(p["actual"] is not None for p in body["series"])
    assert any(p["forecast"] is not None and p["actual"] is None for p in body["series"])


@pytest.mark.skipif(not HAVE_ARTIFACTS, reason="models not trained")
def test_score_batch(client):
    r = client.post("/score/batch", json={"orders": [
        {"order_id": "A-1", "estimated_delivery_days": 3, "customer_seller_distance_km": 3500,
         "customer_state": "AM", "main_seller_state": "SP", "total_price": 200},
        {"order_id": "A-2", "estimated_delivery_days": 15, "customer_state": "SP", "main_seller_state": "SP"},
        {"bogus": "x"},  # a malformed row is imputed, not an error
    ]})
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["orders"] == 3
    rows = body["results"]
    assert rows[0]["order_id"] == "A-1"
    assert any(row["order_id"] == "row-3" for row in rows)  # generated id for the id-less row
    for row in rows:
        assert 0.0 <= row["delay_probability"] <= 1.0
        assert row["delay_risk"] in {"low", "medium", "high"}


def test_score_batch_empty(client):
    r = client.post("/score/batch", json={"orders": []})
    assert r.status_code == 200
    assert r.json()["summary"]["orders"] == 0
