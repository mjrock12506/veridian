# Night Run Report — Phases 2–4 (Data Engineering → ML → MLOps build)

**Date:** 2026-06-17 • **Branch:** `phase-2` • **Scope:** Phases 2, 3, and the
**build-only** part of Phase 4. Stopped before Phase 5 (needs your Anthropic API
key, per instructions). Phase 1 was completed in a prior run.

## Status: ✅ Phases 2–4 (build) complete — stopped at the Phase 5 boundary

Every step ran its checks, fixed failures, and was committed as a checkpoint.
**16/16 tests pass.** Two things need your input before later phases (see
**What I need from you**): Docker isn't installed here, and raw data is tracked
in git from Phase 1.

---

## Phase 2 — Data Engineer (ETL pipeline) ✅

A reproducible, DB-agnostic ETL in `pipeline/`, runnable with one command and
idempotent.

| File | Role |
|---|---|
| `pipeline/config.py` | Paths + `DATABASE_URL` (SQLite default, Postgres-ready). |
| `pipeline/extract.py` | Reads the 9 raw Olist CSVs. |
| `pipeline/transform.py` | Cleans, joins, engineers features, defines labels. |
| `pipeline/load.py` | Writes tables via SQLAlchemy (`if_exists="replace"` → idempotent). |
| `pipeline/run.py` | `python -m pipeline.run` orchestrates the whole thing. |

- **DB-agnostic:** defaults to a local `data/veridian.db` (SQLite) but switches
  to Postgres just by setting `DATABASE_URL` in `.env` — no code change.
- **Two warehouse tables:** `orders_order_level` (99,441 rows × 36 cols, one
  cleaned row per order) and `order_features` (99,441 × 28, model-ready
  features + labels).
- **New features beyond Phase 1:** customer↔seller **haversine shipping
  distance** (the geolocation table deferred in Phase 1, aggregated to one
  lat/lng per ZIP prefix), product weight/volume aggregates, approval delay,
  calendar parts, freight ratio, cross-state-shipment flag, modal seller state.
- **Labels defined:**
  - `is_late` — delivered after the customer's estimate (**8.1%** of delivered).
  - `low_review` — review score ≤ 2 (**14.7%**; dissatisfaction).
  - `is_complaint` — return/complaint **proxy** (Olist has no returns table):
    1-star review **or** order ended `canceled`/`unavailable` (**11.8%**).
- **Idempotent + fast:** full run ≈ 11s; re-running rebuilds tables from scratch.
- **Tests:** `tests/test_pipeline.py` — 6 tests (synthetic fixtures: no
  order fan-out, label logic, haversine, idempotent load). Pass.

Run it: `python -m pipeline.run`

---

## Phase 3 — Data Scientist / ML (models) ✅

`models/train.py` trains, calibrates, and **honestly** evaluates two models;
`models/features.py` pins the leakage-safe feature sets.

**Method (honesty-first):**
- 64% train / 16% validation / 20% test, stratified. The decision threshold is
  tuned on **validation** (max-F1), never on the test set.
- XGBoost in an sklearn preprocessing pipeline (median/most-frequent impute +
  one-hot). Probabilities **isotonic-calibrated** for serving.
- Compared against a **majority-class naive baseline**.
- **Leakage control:** the delay model uses *only* order-time features (no
  delivery outcome). The low-review model is framed as *post-delivery* (the
  review happens after delivery), so it may use delivery-outcome features —
  documented, not leakage.

**Real held-out metrics (no inflation):**

| Model | ROC-AUC | PR-AUC (prevalence) | Brier (cal. / uncal.) | Tuned thr | P / R / F1 | Baseline acc |
|---|---|---|---|---|---|---|
| **delay** | **0.785** | 0.295 (0.081) | 0.066 / 0.156 | 0.153 | 0.28 / 0.48 / 0.35 | 0.919 |
| **low_review** | **0.764** | 0.486 (0.128) | 0.085 / 0.155 | 0.241 | 0.56 / 0.42 / 0.48 | 0.872 |

Reading these honestly: both models **clearly beat random** (ROC-AUC ≈ 0.78/0.76
vs 0.50; PR-AUC ≈ 3.6× / 3.8× the no-skill prevalence line). On heavily
imbalanced data the default-0.5 operating point has low recall, so the API uses
the validation-tuned threshold. Calibration roughly halved Brier score.

**SHAP (delay model)** — top drivers are intuitive: `estimated_delivery_days`,
purchase month (seasonality), `customer_seller_distance_km`, São Paulo origin,
approval delay, cross-state shipment, freight. See `reports/shap_delay.png`.

**Artifacts & reports:**
- `models/artifacts/{delay,low_review}_model.joblib` (calibrated) +
  `_metadata.json`. The `.joblib` files are **gitignored** (3 MB each); regenerate
  with `python -m models.train`. The metadata JSONs are committed.
- `reports/`: `model_report.md`, `metrics_{delay,low_review}.json`,
  `confusion_matrix_*.png`, `shap_delay.{png,json}`.
- **MLflow:** intentionally **not used** — mlflow 3.x pins `pandas<3`, which
  would downgrade the Phase 1/2 pandas 3.0 stack. Per your guidance ("only if it
  runs without extra setup; otherwise save metrics to a file"), metrics are
  written to `reports/`. Easy to add later if we move to pandas 2.x.
- **Tests:** `tests/test_models.py` — artifacts load, score in [0,1], beat the
  baseline. Pass.

Run it: `python -m models.train`

---

## Phase 4 — MLOps (serving, BUILD ONLY — not deployed) ✅

FastAPI app in `api/`, one endpoint per prediction service.

| Endpoint | Returns |
|---|---|
| `GET /health` | status + loaded models |
| `GET /models/{name}` | model card (features, ROC-AUC, threshold) |
| `POST /predict/delay` | calibrated delay probability + alert flag + risk level |
| `POST /predict/low-review` | calibrated dissatisfaction probability + flag |

- **Pydantic schemas** (`api/schemas.py`) — every feature optional; extra fields
  rejected (422). Convenience inputs (e.g. `order_purchase_timestamp`) are
  expanded into the calendar/ratio features the model expects; anything missing
  falls through to the pipeline imputers.
- **Calibrated probability** in every response, with a `flag` at the model's
  tuned threshold and a `risk_level` bucket.
- **Verified locally with uvicorn** (`uvicorn api.main:app`): all endpoints
  respond. Sanity examples — a distant, tight-estimate, cross-state boleto order
  scored **0.26** delay risk (flagged); a padded-estimate same-state order
  scored **0.002**; a 25-day-late delivery scored **0.77** low-review risk.
- **Dockerfile** + `.dockerignore` + lean `requirements-api.txt` (serving deps
  only; installs `libgomp1` for XGBoost; non-root user; healthcheck).
- **Tests:** `tests/test_api.py` via FastAPI `TestClient` — 6 tests. Pass.
- **Not deployed** (per instructions). See below re: Docker.

Run it: `uvicorn api.main:app --reload` → docs at `/docs`.

---

## Decisions made (and why)

- **SQLite default, Postgres-ready.** Everything goes through SQLAlchemy and a
  `DATABASE_URL`; switching to Supabase/Neon is a config change, not a rewrite.
- **Validation-tuned thresholds, not test-tuned.** Keeps the reported test
  metrics honest.
- **Leakage boundary enforced in code** via per-model feature lists.
- **Calibrated probabilities** (isotonic) so the API's numbers are usable as
  real probabilities, not just rankings.
- **Skipped MLflow** to protect the pandas 3.0 stack (see Phase 3).
- **Slim serving image** — the API image excludes jupyter/matplotlib/shap/
  sqlalchemy; only what's needed to load the joblib pipeline and serve.

## Environment note
- **`libomp` was installed via Homebrew** (`brew install libomp`) — XGBoost's
  macOS wheel needs the OpenMP runtime. This is a local system dependency, not a
  Python package; the Docker image installs the Linux equivalent (`libgomp1`).
- Python 3.14.5 + pandas 3.0 confirmed working across all of ML + serving. The
  only friction was two upstream-newness quirks I worked around: XGBoost needing
  libomp, and SQLAlchemy column names (`quoted_name`) not being recognized by
  scikit-learn 1.9 (normalized to plain `str`).

---

## What I need from you next (blockers / decisions)

1. **Phase 5 (AI layer) needs your `ANTHROPIC_API_KEY`.** I stopped here as
   instructed and did not start it. Add the key to `.env` (see `.env.example`)
   when you want me to proceed.
2. **Docker build not verified — Docker isn't installed on this machine.** The
   `Dockerfile` is written and the app is verified under uvicorn, but I couldn't
   run `docker build`. Install Docker Desktop if you want me to build/run the
   image and confirm the container serves.
3. **Raw data is committed to git (from Phase 1).** `data/raw/*.csv` (~150 MB)
   and `data/raw/archive.zip` (~45 MB) are tracked despite `.gitignore` —
   CLAUDE.md says never commit raw data dumps. I untracked the 36 MB processed
   CSV this run, but did **not** rewrite history or `git rm --cached` the raw
   files (potentially destructive / your call). Tell me if you want them purged
   (and whether to rewrite history to drop them from past commits).
4. **Stack confirmation (FYI, not blocking).** Python 3.14 + pandas 3.0 works
   end-to-end. If you'd still prefer a more battle-tested combo for deployment,
   flag it and I'll re-pin.

## Commits this run (on `phase-2`)
1. Phase 2 — reproducible ETL pipeline (CSVs → SQLite via SQLAlchemy)
2. Phase 3 — train + honestly evaluate delay and low-review models
3. Phase 4 — FastAPI serving + Dockerfile (build/test only)

## Suggested next step (do NOT start without your go-ahead)
Phase 5 — the LLM agent / RAG / tool-calling layer, which needs your Anthropic
API key. Or, if you'd rather harden what's built: install Docker so I can verify
the image, and decide on the raw-data-in-git cleanup.
