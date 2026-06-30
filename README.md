# Veridian — Order Intelligence Platform

> **Predict which e-commerce orders will ship late or earn a 1–2★ review — and act before the cost hits.**

**[▶ Live demo](https://veridian-lyart.vercel.app)**  ·  [How it works, in plain English](docs/HOW_IT_WORKS.md)

Veridian scores every order the moment it's placed, flags the ones likely to go
wrong, and helps an operations team act before the refund, churn, or bad review
lands. It's a complete ML product — **data pipeline → calibrated risk models →
FastAPI service → a Next.js workspace** — built on ~100k real
[Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) orders
(2016–2018).

### What's inside

- 🎯 **Two calibrated risk models** — late delivery & low review (XGBoost, isotonic-calibrated)
- 🧠 **An LLM copilot** grounded in the data, model cards, and your own uploaded orders
- ⚡ **An agentic AI action center** — triage, draft outreach, route to your tools, one-click bulk approve
- 📊 **Customer segments, a demand forecast, and an ROI calculator**
- 🔌 **A live webhook connector** (Slack / Zapier / Sheets / Zendesk) and CSV "bring your own orders" scoring

## The problem

Retailers learn about late deliveries and unhappy customers only after the cost
is already incurred — refunds, churn, and low review scores. The operational
data that could flag these outcomes in advance already exists; what is missing
is a system that turns it into forward-looking, order-level risk scores. Veridian
trains calibrated models on that data and exposes them through an API that
returns a probability and an alert flag per order.

## What it predicts

| Model | Target | Framing |
|---|---|---|
| `delay` | Order delivered later than the customer's estimate (`is_late`, 8.1% base rate) | Order-time features only — no delivery outcome |
| `low_review` | Customer leaves a 1–2★ review (`low_review`, 12.8% base rate) | Post-delivery — the review happens after delivery, so delivery-outcome features are permitted |

Both models are isotonic-calibrated and beat a majority-class baseline on a
held-out test set. Full methodology and honest metrics are in
[`docs/MODEL_CARD.md`](docs/MODEL_CARD.md).

## Architecture

```
Olist CSVs ─▶ ETL pipeline ─▶ SQL warehouse ─▶ model training ─▶ artifacts ─▶ FastAPI ─▶ AI copilot ─▶ Web app
 (raw data)  (pipeline/)     (orders +        (models/)        (calibrated  (api/)     (ai/: LLM +    (web/:
                             features)                          pipelines)              tools + RAG)   Next.js)
```

1. **Data** — nine raw Olist CSVs are cleaned, joined, and reduced to one row
   per order, plus a model-ready feature table with labels.
2. **Pipeline** (`pipeline/`) — a reproducible, database-agnostic ETL that writes
   both tables to a SQL warehouse (SQLite by default, Postgres via `DATABASE_URL`).
3. **Models** (`models/`) — XGBoost classifiers in scikit-learn pipelines, with a
   strict leakage boundary, validation-tuned thresholds, isotonic calibration, and
   evaluation against a naive baseline.
4. **API** (`api/`) — FastAPI serving the prediction, dashboard, and copilot
   endpoints, each returning a calibrated probability, a tuned alert flag, and a
   risk bucket where applicable.
5. **AI copilot** (`ai/`) — a provider-agnostic LLM (via LiteLLM) that answers
   natural-language questions, calling the prediction models as tools and
   grounding dataset answers in a local Chroma vector store. Exposed as `/ask`,
   with guardrails and an eval harness.
6. **Web app** (`web/`) — a Next.js (App Router) + Tailwind frontend: a marketing
   landing page and a working app (risk dashboard, order drill-down, AI copilot,
   and a score-an-order form) that calls the FastAPI backend.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the layers connect and
the contracts between them.

## Tech stack

- **Data / pipeline:** pandas, NumPy, SQLAlchemy, SQLite / PostgreSQL
- **ML:** scikit-learn, XGBoost, SHAP, joblib
- **Serving:** FastAPI, Uvicorn, Pydantic, Docker
- **AI copilot:** LiteLLM (provider-agnostic LLM), Chroma (local vector store / RAG)
- **Web app:** Next.js (App Router), TypeScript, Tailwind, shadcn-style UI, Framer Motion, React Three Fiber, Recharts
- **Tooling:** pytest, ruff, black

Dependencies are pinned in `requirements.txt` (full stack) and
`requirements-api.txt` (serving-only subset baked into the Docker image).

## Repository layout

```
pipeline/     ETL: extract, transform, load, run
models/       feature definitions, training, evaluation, artifacts
api/          FastAPI app: schemas, model registry, endpoints, webhook dispatch
ai/           copilot: multi-provider LLM interface, prediction tools, RAG, eval
web/          Next.js workspace: landing + dashboard, action center, copilot, ROI, integrations, connect
data/         raw (gitignored) + processed warehouse (SQLite)
reports/      generated metrics, confusion matrices, SHAP, model + eval reports
docs/         vision, data dictionary, architecture, model card, product overview
qa/           end-to-end QA suite + test dataset
notebooks/    exploratory data analysis
tests/        pipeline, model, API, and AI tests
```

## Running it locally

### Prerequisites

- Python 3.14
- On macOS, XGBoost needs the OpenMP runtime: `brew install libomp`
- The raw Olist CSVs placed in `data/raw/` (not committed; download from Kaggle)

### Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # optional; defaults to a local SQLite warehouse
```

### Build the warehouse, train, and serve

```bash
# 1. ETL — builds the SQL warehouse (SQLite at data/veridian.db by default)
python -m pipeline.run

# 2. Train + evaluate — writes calibrated artifacts to models/artifacts/
#    and metrics/plots/report to reports/
python -m models.train

# 3. Build the copilot's retrieval index (data dictionary + model stats)
python -m ai.index_knowledge

# 4. Serve — API docs at http://127.0.0.1:8000/docs (includes /ask)
uvicorn api.main:app --reload
```

To target Postgres instead of SQLite, set `DATABASE_URL` in `.env` to a
SQLAlchemy URL (e.g. `postgresql+psycopg://user:pass@host:5432/dbname`); no code
change is required.

### Configuring the copilot LLM

The copilot talks to the LLM through [LiteLLM](https://docs.litellm.ai), so the
provider is a configuration choice. Set the model and its key in `.env`:

```bash
GEMINI_API_KEY=your-key-here          # default provider (Gemini free tier)
# LLM_MODEL=gemini/gemini-2.5-flash    # override to switch providers, e.g.:
#   groq/llama-3.3-70b-versatile  (GROQ_API_KEY)
#   anthropic/claude-haiku-4-5    (ANTHROPIC_API_KEY)
#   ollama/llama3                 (local, no key)
```

Switching providers is a one-line `LLM_MODEL` change — no code edits. If the
configured provider is unavailable, `/ask` still returns retrieved sources and a
clear message rather than failing.

### Example request

```bash
curl -s -X POST http://127.0.0.1:8000/predict/delay \
  -H 'content-type: application/json' \
  -d '{
        "estimated_delivery_days": 12,
        "customer_seller_distance_km": 1800,
        "customer_state": "AM",
        "main_seller_state": "SP",
        "primary_payment_type": "boleto"
      }'
# -> {"model":"delay","probability":...,"decision_threshold":0.1529,"flag":...,"risk_level":...}
```

Ask the copilot a question, optionally with an order to score:

```bash
curl -s -X POST http://127.0.0.1:8000/ask \
  -H 'content-type: application/json' \
  -d '{
        "question": "What is the delay risk for this order, and how good is the model?",
        "order": {"estimated_delivery_days": 8, "customer_seller_distance_km": 2000,
                  "customer_state": "AM", "main_seller_state": "SP"}
      }'
# -> {"answer":"...","model_results":[{"model":"delay","probability":...}],"sources":[...]}
```

### Web app

The frontend lives in `web/` and calls the FastAPI backend. Run the backend
first, then the dev server:

```bash
# backend (from the repo root) — allow the web origin and serve
uvicorn api.main:app --reload          # http://localhost:8000

# frontend (in another terminal)
cd web
npm install
cp .env.example .env.local             # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                            # http://localhost:3000
```

The landing page is at `/`; the app is at `/dashboard`, `/copilot`, and
`/score`. CORS allows `http://localhost:3000` by default (override with the
backend's `CORS_ORIGINS`). The `/dashboard` endpoint reads the warehouse, so run
`python -m pipeline.run` and `python -m models.train` first.

### Docker (serving image)

```bash
docker build -t veridian-api .          # requires models/artifacts/ to exist
docker run --rm -p 8000:8000 veridian-api
curl localhost:8000/health
```

The serving image installs only the prediction dependencies, so it serves
`/predict` and `/health`. The copilot (`/ask`) needs the full `requirements.txt`
and runs from the local app (`uvicorn api.main:app`).

### Tests and evaluation

```bash
pytest                       # pipeline, model, API, and AI tests (LLM is mocked)
python -m ai.eval.run_eval   # copilot behaviour eval -> reports/ai_eval_results.json
ruff check . && black .
```

## Conventions

- Configuration comes from environment variables (`.env`); no hardcoded paths.
- Raw data and trained artifacts are gitignored and regenerated by the pipeline
  and training scripts.
- Model probabilities are calibrated and metrics are reported on held-out data
  against a baseline — see the model card for the numbers.
