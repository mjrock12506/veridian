# Phase 3 — Model Report

Honest hold-out evaluation (20% stratified test set) of each model against a majority-class naive baseline. Probabilities are isotonic-calibrated for serving.

## delay

- Population: 96,478 orders · train 61,740 · val 15,436 · test 19,294
- Positive base rate (test): **8.1%**

**Threshold-independent (ranking + calibration):**

| Metric | Model | Naive baseline |
|---|---|---|
| ROC-AUC | **0.7845** | 0.5 |
| PR-AUC | **0.2946** | 0.0811 (prevalence) |
| Brier (calibrated) | 0.0655 | — |
| Brier (uncalibrated) | 0.156 | — |

**Operating points** (naive baseline accuracy = 0.9189, recall on positives = 0.0):

| Threshold | Precision | Recall | F1 | Accuracy |
|---|---|---|---|---|
| 0.50 | 0.6 | 0.0498 | 0.092 | 0.9202 |
| 0.1529 (tuned/max-F1) | 0.2762 | 0.4754 | 0.3494 | 0.8564 |

Confusion matrix (test @ tuned threshold): `reports/confusion_matrix_delay.png`

Top SHAP features (`reports/shap_delay.png`):

- `num__estimated_delivery_days` — 0.58962
- `num__purchase_month` — 0.57902
- `num__customer_seller_distance_km` — 0.30265
- `cat__customer_state_SP` — 0.16045
- `num__approval_delay_hours` — 0.15886
- `num__cross_state_shipment` — 0.14648
- `num__total_freight` — 0.11309
- `cat__customer_state_MG` — 0.10597
- `cat__customer_state_RJ` — 0.09573
- `num__avg_product_weight_g` — 0.09386

## low_review

- Population: 96,478 orders · train 61,332 · val 15,333 · test 19,167
- Positive base rate (test): **12.8%**

**Threshold-independent (ranking + calibration):**

| Metric | Model | Naive baseline |
|---|---|---|
| ROC-AUC | **0.7643** | 0.5 |
| PR-AUC | **0.4858** | 0.1281 (prevalence) |
| Brier (calibrated) | 0.0853 | — |
| Brier (uncalibrated) | 0.155 | — |

**Operating points** (naive baseline accuracy = 0.8719, recall on positives = 0.0):

| Threshold | Precision | Recall | F1 | Accuracy |
|---|---|---|---|---|
| 0.50 | 0.7677 | 0.3096 | 0.4412 | 0.8996 |
| 0.2407 (tuned/max-F1) | 0.5569 | 0.4228 | 0.4807 | 0.883 |

Confusion matrix (test @ tuned threshold): `reports/confusion_matrix_low_review.png`
