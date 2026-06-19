# Veridian — Order Intelligence Platform

Veridian predicts which e-commerce orders are likely to go wrong — delivered
late or followed by a dissatisfied review — so that operations teams can act on
at-risk orders before the cost is locked in. It is built end to end on the
[Olist Brazilian E-Commerce dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
(~100k orders, 2016–2018) and covers the full lifecycle: data engineering,
model training and honest evaluation, calibrated probability serving, and an
applied-AI copilot that answers questions grounded in the data and models.

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
Olist CSVs ──▶ ETL pipeline ──▶ SQL warehouse ──▶ model training ──▶ artifacts ──▶ FastAPI ──▶ AI copilot
 (raw data)   (pipeline/)      (orders +         (models/)         (calibrated   (api/)       (ai/: LLM +
                                features)                           pipelines)                 tools + RAG)
```

1. **Data** — nine raw Olist CSVs are cleaned, joined, and reduced to one row
   per order, plus a model-ready feature table with labels.
2. **Pipeline** (`pipeline/`) — a reproducible, database-agnostic ETL that writes
   both tables to a SQL warehouse (SQLite by default, Postgres via `DATABASE_URL`).
3. **Models** (`models/`) — XGBoost classifiers in scikit-learn pipelines, with a
   strict leakage boundary, validation-tuned thresholds, isotonic calibration, and
   evaluation against a naive baseline.
4. **API** (`api/`) — FastAPI serving one endpoint per model, returning a
   calibrated probability, a tuned alert flag, and a risk bucket.
5. **AI copilot** (`ai/`) — a provider-agnostic LLM (via LiteLLM) that answers
   natural-language questions, calling the prediction models as tools and
   grounding dataset answers in a local Chroma vector store. Exposed as `/ask`,
   with guardrails and an eval harness.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the layers connect and
the contracts between them.

## Tech stack

- **Data / pipeline:** pandas, NumPy, SQLAlchemy, SQLite / PostgreSQL
- **ML:** scikit-learn, XGBoost, SHAP, joblib
- **Serving:** FastAPI, Uvicorn, Pydantic, Docker
- **AI copilot:** LiteLLM (provider-agnostic LLM), Chroma (local vector store / RAG)
- **Tooling:** pytest, ruff, black

Dependencies are pinned in `requirements.txt` (full stack) and
`requirements-api.txt` (serving-only subset baked into the Docker image).

## Repository layout

```
data/         raw (gitignored) + processed artifacts
notebooks/    exploratory data analysis
pipeline/     ETL: extract, transform, load, run
models/       feature definitions, training, evaluation, artifacts
api/          FastAPI app: schemas, model registry, endpoints
ai/           copilot: LLM interface, prediction tools, RAG, eval harness
reports/      generated metrics, confusion matrices, SHAP, model + eval reports
docs/         vision, data dictionary, architecture, model card
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
