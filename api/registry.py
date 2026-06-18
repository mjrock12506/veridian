"""Model registry + feature assembly for the API.

Loads the calibrated joblib artifacts and their metadata once, and turns a
validated request payload into the single-row DataFrame the sklearn pipeline
expects (deriving calendar/ratio features the client may have omitted).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ARTIFACTS = Path(__file__).resolve().parent.parent / "models" / "artifacts"


@dataclass
class LoadedModel:
    name: str
    pipeline: object
    meta: dict

    @property
    def numeric(self) -> list[str]:
        return self.meta["numeric_features"]

    @property
    def categorical(self) -> list[str]:
        return self.meta["categorical_features"]

    @property
    def threshold(self) -> float:
        return float(self.meta.get("decision_threshold", 0.5))


class Registry:
    """Lazily loads model artifacts; raises a clear error if not yet trained."""

    MODEL_NAMES = ("delay", "low_review")

    def __init__(self, artifacts_dir: Path = ARTIFACTS):
        self.artifacts_dir = artifacts_dir
        self._models: dict[str, LoadedModel] = {}

    def load(self) -> None:
        for name in self.MODEL_NAMES:
            model_path = self.artifacts_dir / f"{name}_model.joblib"
            meta_path = self.artifacts_dir / f"{name}_metadata.json"
            if model_path.exists() and meta_path.exists():
                self._models[name] = LoadedModel(
                    name=name,
                    pipeline=joblib.load(model_path),
                    meta=json.loads(meta_path.read_text()),
                )

    @property
    def loaded_names(self) -> list[str]:
        return sorted(self._models)

    def get(self, name: str) -> LoadedModel:
        if name not in self._models:
            raise KeyError(
                f"Model '{name}' not loaded. Train it with `python -m models.train` "
                "so the artifact exists in models/artifacts/."
            )
        return self._models[name]


def _derive(payload: dict) -> dict:
    """Fill convenience-derivable features when the client omitted them."""
    p = dict(payload)

    ts = p.pop("order_purchase_timestamp", None)
    if ts:
        try:
            dt = pd.to_datetime(ts)
            p.setdefault("purchase_month", float(dt.month))
            p.setdefault("purchase_dow", float(dt.dayofweek))
            p.setdefault("purchase_hour", float(dt.hour))
            p.setdefault("purchase_is_weekend", float(dt.dayofweek >= 5))
        except Exception:
            pass  # bad timestamp -> leave calendar features to imputation

    price, freight = p.get("total_price"), p.get("total_freight")
    if p.get("freight_ratio") is None and price is not None and freight is not None:
        denom = price + freight
        if denom:
            p["freight_ratio"] = freight / denom

    cust, seller = p.get("customer_state"), p.get("main_seller_state")
    if p.get("cross_state_shipment") is None and cust and seller:
        p["cross_state_shipment"] = float(cust != seller)

    return p


def build_feature_row(payload: dict, model: LoadedModel) -> pd.DataFrame:
    """One-row DataFrame with exactly the model's expected columns/order."""
    p = _derive(payload)
    row: dict[str, object] = {}
    for col in model.numeric:
        v = p.get(col)
        row[col] = np.nan if v is None else float(v)
    for col in model.categorical:
        v = p.get(col)
        row[col] = None if v is None else str(v)
    return pd.DataFrame([row], columns=model.numeric + model.categorical)


def risk_level(prob: float, threshold: float) -> str:
    if prob >= max(threshold * 2, 0.5):
        return "high"
    if prob >= threshold:
        return "medium"
    return "low"
