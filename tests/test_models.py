"""Smoke tests for the Phase 3 trained model artifacts.

Skipped automatically if the artifacts haven't been built yet
(run ``python -m models.train`` first).
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest

ARTIFACTS = Path(__file__).resolve().parent.parent / "models" / "artifacts"
MODELS = ["delay", "low_review"]


def _sample_row(meta: dict) -> pd.DataFrame:
    """A single plausible feature row matching a model's expected columns."""
    row = {c: 1.0 for c in meta["numeric_features"]}
    row.update({c: "unknown" for c in meta["categorical_features"]})
    # a few realistic values
    row["estimated_delivery_days"] = 20.0
    row["customer_state"] = "SP"
    return pd.DataFrame([row])


@pytest.mark.parametrize("name", MODELS)
def test_artifact_loads_and_scores(name):
    model_path = ARTIFACTS / f"{name}_model.joblib"
    meta_path = ARTIFACTS / f"{name}_metadata.json"
    if not model_path.exists() or not meta_path.exists():
        pytest.skip(f"{name} artifact not built; run `python -m models.train`")

    meta = json.loads(meta_path.read_text())
    model = joblib.load(model_path)
    X = _sample_row(meta)
    proba = model.predict_proba(X)[:, 1]
    assert proba.shape == (1,)
    assert 0.0 <= float(proba[0]) <= 1.0
    assert 0.0 <= meta["decision_threshold"] <= 1.0
    assert meta["roc_auc"] > 0.5  # beats random


@pytest.mark.parametrize("name", MODELS)
def test_metrics_report_beats_baseline(name):
    report_path = Path(__file__).resolve().parent.parent / "reports" / f"metrics_{name}.json"
    if not report_path.exists():
        pytest.skip("metrics not generated yet")
    r = json.loads(report_path.read_text())
    # Model ROC-AUC must beat the naive baseline's 0.5.
    assert r["ranking_metrics"]["roc_auc"] > r["naive_baseline"]["roc_auc"]
    # PR-AUC must beat the no-skill prevalence line.
    assert r["ranking_metrics"]["pr_auc"] > r["positive_base_rate"]
