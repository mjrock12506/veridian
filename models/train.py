"""Phase 3 — train + honestly evaluate the delay and low-review models.

Run:

    python -m models.train

For each target it:
  1. Loads the feature table from the warehouse (built by Phase 2).
  2. Selects a leakage-safe feature set (see models/features.py).
  3. Trains an XGBoost classifier wrapped in an sklearn preprocessing pipeline,
     then calibrates its probabilities (isotonic) on held-out folds.
  4. Evaluates on a stratified hold-out test set vs a majority-class baseline:
     ROC-AUC, PR-AUC, precision/recall/F1, Brier score, confusion matrix.
  5. Saves SHAP feature importance for the main (delay) model.
  6. Writes artifacts to models/artifacts/ and metrics/plots/report to reports/.

MLflow is intentionally not used (its pandas<3 pin conflicts with this stack);
metrics are written to JSON + a markdown report instead.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sqlalchemy import create_engine
from xgboost import XGBClassifier

import joblib

from models import features as F
from pipeline import config

ROOT = config.ROOT
ARTIFACTS = ROOT / "models" / "artifacts"
REPORTS = ROOT / "reports"
RANDOM_STATE = 42


# --------------------------------------------------------------------------- #
# Data loading
# --------------------------------------------------------------------------- #
def load_modeling_frame() -> pd.DataFrame:
    """Feature table joined with the delivery-outcome columns it needs."""
    engine = create_engine(config.DATABASE_URL)
    feats = pd.read_sql_table(config.FEATURES_TABLE, engine)
    order_level = pd.read_sql_table(config.ORDERS_TABLE, engine)
    # SQLAlchemy hands back column names as `quoted_name` (a str subclass);
    # scikit-learn only recognises plain `str` names, so normalise them.
    feats.columns = [str(c) for c in feats.columns]
    order_level.columns = [str(c) for c in order_level.columns]
    delivery_cols = [
        "order_id", "actual_delivery_days", "delivery_vs_estimate_days",
    ]
    df = feats.merge(order_level[delivery_cols], on="order_id", how="left")
    # boolean-ish columns arrive from SQLite as 0/1/None or "True"/"False"
    for col in ("is_late", "low_review", "is_complaint"):
        df[col] = _to_bool(df[col])
    df["is_late_int"] = df["is_late"].astype("float64")  # feature for low-review model
    return df


def _to_bool(s: pd.Series) -> pd.Series:
    mapping = {True: True, False: False, "True": True, "False": False,
               1: True, 0: False, 1.0: True, 0.0: False}
    return s.map(lambda v: mapping.get(v, pd.NA)).astype("boolean")


# --------------------------------------------------------------------------- #
# Model construction
# --------------------------------------------------------------------------- #
def build_pipeline(numeric: list[str], categorical: list[str], pos_weight: float) -> Pipeline:
    pre = ColumnTransformer(
        transformers=[
            ("num", SimpleImputer(strategy="median"), numeric),
            (
                "cat",
                Pipeline([
                    ("impute", SimpleImputer(strategy="most_frequent")),
                    ("oh", OneHotEncoder(handle_unknown="ignore", min_frequency=50)),
                ]),
                categorical,
            ),
        ],
        remainder="drop",
    )
    clf = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        scale_pos_weight=pos_weight,
        objective="binary:logistic",
        eval_metric="logloss",
        n_jobs=-1,
        random_state=RANDOM_STATE,
        tree_method="hist",
    )
    return Pipeline([("pre", pre), ("clf", clf)])


# --------------------------------------------------------------------------- #
# Evaluation
# --------------------------------------------------------------------------- #
def best_f1_threshold(y_true, proba) -> float:
    """Threshold that maximises F1 on the given (validation) set."""
    prec, rec, thr = precision_recall_curve(y_true, proba)
    f1 = np.divide(2 * prec * rec, prec + rec,
                   out=np.zeros_like(prec), where=(prec + rec) > 0)
    # thr has len = len(prec) - 1; align by dropping the last prec/rec point.
    best = int(np.argmax(f1[:-1])) if len(thr) else 0
    return float(thr[best]) if len(thr) else 0.5


def _point_metrics(y_true, pred) -> dict:
    return {
        "precision": round(float(precision_score(y_true, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, pred, zero_division=0)), 4),
        "accuracy": round(float(np.mean(pred == y_true)), 4),
        "confusion_matrix": confusion_matrix(y_true, pred, labels=[0, 1]).tolist(),
    }


def evaluate(name: str, y_true, proba, tuned_threshold: float) -> dict:
    base_rate = float(np.mean(y_true))
    # Naive baseline = always predict the majority class.
    majority = 1 if base_rate >= 0.5 else 0
    base_pred = np.full_like(y_true, majority)
    return {
        "model": name,
        "n_test": int(len(y_true)),
        "positive_base_rate": round(base_rate, 4),
        # Threshold-independent ranking + calibration quality (the headline numbers).
        "ranking_metrics": {
            "roc_auc": round(float(roc_auc_score(y_true, proba)), 4),
            "pr_auc": round(float(average_precision_score(y_true, proba)), 4),
            "brier_score": round(float(brier_score_loss(y_true, proba)), 4),
        },
        # Operating points: default 0.5 and a validation-tuned (max-F1) threshold.
        "at_threshold_0.5": _point_metrics(y_true, (proba >= 0.5).astype(int)),
        "tuned_threshold": round(tuned_threshold, 4),
        "at_tuned_threshold": _point_metrics(y_true, (proba >= tuned_threshold).astype(int)),
        "naive_baseline": {
            "strategy": "predict_majority_class",
            "accuracy": round(float(np.mean(base_pred == y_true)), 4),
            "recall_on_positive": round(float(recall_score(y_true, base_pred, zero_division=0)), 4),
            "roc_auc": 0.5,
        },
    }


def plot_confusion(cm: list[list[int]], title: str, path: Path) -> None:
    arr = np.array(cm)
    fig, ax = plt.subplots(figsize=(4.2, 3.8))
    im = ax.imshow(arr, cmap="Blues")
    ax.set_xticks([0, 1], labels=["pred 0", "pred 1"])
    ax.set_yticks([0, 1], labels=["true 0", "true 1"])
    total = arr.sum()
    for i in range(2):
        for j in range(2):
            ax.text(j, i, f"{arr[i, j]:,}\n({arr[i, j] / total:.1%})",
                    ha="center", va="center",
                    color="white" if arr[i, j] > arr.max() / 2 else "black")
    ax.set_title(title)
    fig.colorbar(im, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def shap_importance(pipeline: Pipeline, X_sample: pd.DataFrame, path_png: Path,
                    path_json: Path, top_n: int = 20) -> list[dict]:
    """Compute mean(|SHAP|) feature importance for the fitted XGB pipeline."""
    import shap

    pre = pipeline.named_steps["pre"]
    clf = pipeline.named_steps["clf"]
    X_trans = pre.transform(X_sample)
    feat_names = list(pre.get_feature_names_out())
    explainer = shap.TreeExplainer(clf)
    sv = explainer.shap_values(X_trans)
    mean_abs = np.abs(sv).mean(axis=0)
    order = np.argsort(mean_abs)[::-1]
    ranked = [{"feature": feat_names[i], "mean_abs_shap": round(float(mean_abs[i]), 5)}
              for i in order]

    top = ranked[:top_n]
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.barh([t["feature"] for t in top][::-1],
            [t["mean_abs_shap"] for t in top][::-1], color="#3a7bd5")
    ax.set_xlabel("mean(|SHAP value|)")
    ax.set_title("Delay model — SHAP feature importance (top 20)")
    fig.tight_layout()
    fig.savefig(path_png, dpi=130)
    plt.close(fig)
    path_json.write_text(json.dumps(ranked, indent=2))
    return top


# --------------------------------------------------------------------------- #
# Per-target training
# --------------------------------------------------------------------------- #
def train_target(name: str, df: pd.DataFrame, label_col: str,
                 population_mask: pd.Series, do_shap: bool) -> dict:
    numeric, categorical = F.feature_columns(name)
    data = df[population_mask].copy()
    y = data[label_col].astype("boolean")
    keep = y.notna()
    data, y = data[keep], y[keep].astype(int).to_numpy()
    X = data[numeric + categorical].copy()
    # Cast SQL-origin string columns to plain object for sklearn compatibility.
    for col in categorical:
        X[col] = X[col].astype(object)

    # 64% train / 16% validation / 20% test (validation tunes the threshold only).
    X_trv, X_te, y_trv, y_te = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    X_tr, X_val, y_tr, y_val = train_test_split(
        X_trv, y_trv, test_size=0.2, stratify=y_trv, random_state=RANDOM_STATE
    )
    pos_weight = float((y_tr == 0).sum() / max((y_tr == 1).sum(), 1))

    # Base (uncalibrated) pipeline — used for metrics interpretation + SHAP.
    base = build_pipeline(numeric, categorical, pos_weight)
    base.fit(X_tr, y_tr)

    # Calibrated probabilities for serving (isotonic, 3-fold on the training set).
    calibrated = CalibratedClassifierCV(base, method="isotonic", cv=3)
    calibrated.fit(X_tr, y_tr)

    proba_base = base.predict_proba(X_te)[:, 1]
    proba_val = calibrated.predict_proba(X_val)[:, 1]
    proba_cal = calibrated.predict_proba(X_te)[:, 1]

    threshold = best_f1_threshold(y_val, proba_val)  # tuned on validation, not test
    report = evaluate(name, y_te, proba_cal, threshold)
    report["uncalibrated_brier"] = round(float(brier_score_loss(y_te, proba_base)), 4)
    report["train_size"] = int(len(y_tr))
    report["val_size"] = int(len(y_val))
    report["population"] = int(population_mask.sum())
    report["features"] = {"numeric": numeric, "categorical": categorical}

    plot_confusion(report["at_tuned_threshold"]["confusion_matrix"],
                   f"{name} — confusion matrix (test @ tuned thr={threshold:.2f})",
                   REPORTS / f"confusion_matrix_{name}.png")

    if do_shap:
        sample = X_te.sample(min(3000, len(X_te)), random_state=RANDOM_STATE)
        report["shap_top"] = shap_importance(
            base, sample, REPORTS / f"shap_{name}.png", REPORTS / f"shap_{name}.json"
        )

    # Persist the calibrated serving model + metadata.
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump(calibrated, ARTIFACTS / f"{name}_model.joblib")
    meta = {
        "name": name,
        "label_col": label_col,
        "numeric_features": numeric,
        "categorical_features": categorical,
        "positive_base_rate": report["positive_base_rate"],
        "roc_auc": report["ranking_metrics"]["roc_auc"],
        "decision_threshold": report["tuned_threshold"],
        "calibrated": True,
        "calibration_method": "isotonic",
    }
    (ARTIFACTS / f"{name}_metadata.json").write_text(json.dumps(meta, indent=2))
    (REPORTS / f"metrics_{name}.json").write_text(json.dumps(report, indent=2))
    rm, tt = report["ranking_metrics"], report["at_tuned_threshold"]
    print(f"[train] {name}: ROC-AUC={rm['roc_auc']} PR-AUC={rm['pr_auc']} "
          f"Brier={rm['brier_score']} | @thr={report['tuned_threshold']}: "
          f"P={tt['precision']} R={tt['recall']} F1={tt['f1']} "
          f"| baseline_acc={report['naive_baseline']['accuracy']}")
    return report


def write_markdown_report(reports: dict[str, dict]) -> None:
    lines = ["# Phase 3 — Model Report", ""]
    lines.append("Honest hold-out evaluation (20% stratified test set) of each model "
                 "against a majority-class naive baseline. Probabilities are "
                 "isotonic-calibrated for serving.\n")
    for name, r in reports.items():
        rm = r["ranking_metrics"]
        nb = r["naive_baseline"]
        t5, tt = r["at_threshold_0.5"], r["at_tuned_threshold"]
        lines += [
            f"## {name}",
            "",
            f"- Population: {r['population']:,} orders · train {r['train_size']:,} · "
            f"val {r['val_size']:,} · test {r['n_test']:,}",
            f"- Positive base rate (test): **{r['positive_base_rate']:.1%}**",
            "",
            "**Threshold-independent (ranking + calibration):**",
            "",
            "| Metric | Model | Naive baseline |",
            "|---|---|---|",
            f"| ROC-AUC | **{rm['roc_auc']}** | {nb['roc_auc']} |",
            f"| PR-AUC | **{rm['pr_auc']}** | {r['positive_base_rate']} (prevalence) |",
            f"| Brier (calibrated) | {rm['brier_score']} | — |",
            f"| Brier (uncalibrated) | {r['uncalibrated_brier']} | — |",
            "",
            f"**Operating points** (naive baseline accuracy = {nb['accuracy']}, "
            f"recall on positives = {nb['recall_on_positive']}):",
            "",
            "| Threshold | Precision | Recall | F1 | Accuracy |",
            "|---|---|---|---|---|",
            f"| 0.50 | {t5['precision']} | {t5['recall']} | {t5['f1']} | {t5['accuracy']} |",
            f"| {r['tuned_threshold']} (tuned/max-F1) | {tt['precision']} | {tt['recall']} "
            f"| {tt['f1']} | {tt['accuracy']} |",
            "",
            f"Confusion matrix (test @ tuned threshold): `reports/confusion_matrix_{name}.png`",
            "",
        ]
        if "shap_top" in r:
            lines.append(f"Top SHAP features (`reports/shap_{name}.png`):")
            lines.append("")
            for t in r["shap_top"][:10]:
                lines.append(f"- `{t['feature']}` — {t['mean_abs_shap']}")
            lines.append("")
    (REPORTS / "model_report.md").write_text("\n".join(lines))


def main() -> int:
    REPORTS.mkdir(parents=True, exist_ok=True)
    df = load_modeling_frame()
    delivered = df["order_status"] == "delivered"

    reports = {}
    # Delay model: delivered orders only, order-time features, SHAP.
    reports["delay"] = train_target("delay", df, "is_late", delivered, do_shap=True)
    # Low-review model: delivered orders with a review, post-delivery features.
    reports["low_review"] = train_target(
        "low_review", df, "low_review", delivered, do_shap=False
    )

    write_markdown_report(reports)
    print(f"[train] wrote reports/ and models/artifacts/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
