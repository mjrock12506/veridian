# CLAUDE.md — Veridian (Order Intelligence Platform)

## What we're building
An end-to-end web app that predicts which e-commerce orders will go wrong (late delivery, customer dissatisfaction, return) and tells the retailer what to do about it. Built on the Olist Brazilian e-commerce dataset. Covers the full data -> ML -> MLOps -> AI -> full-stack lifecycle.

## Architecture (layers)
1. Data: Olist CSVs -> cleaned/joined -> Postgres warehouse + feature table.
2. ML: scikit-learn/XGBoost models (delay, satisfaction, return-risk); PyTorch + Hugging Face for review NLP.
3. Serving/MLOps: FastAPI serves models; Docker; MLflow tracking; scheduled pipeline.
4. Applied AI: LLM agent (RAG + tool-calling via MCP) over the data + models; evals + guardrails.
5. Web app: React/Next.js + Tailwind frontend; FastAPI backend; Supabase Auth (accounts/SSO).
6. Deploy: HF Spaces/Render (backend), Vercel (frontend), Supabase/Neon (DB), GitHub Actions (CI + schedule).

## Tech stack
- Languages: Python (data/ML/backend), TypeScript/React (frontend)
- Data: pandas, NumPy, SQL, PostgreSQL (Supabase/Neon), SQLAlchemy
- ML: scikit-learn, XGBoost, SHAP, MLflow; PyTorch + Hugging Face Transformers (NLP)
- Serving: FastAPI, Uvicorn, Docker
- Orchestration: Prefect (or GitHub Actions cron for simple scheduling)
- Applied AI: Anthropic Claude API, LangGraph, pgvector/Chroma, DeepEval
- Frontend: React (or Next.js), Tailwind CSS
- Auth: Supabase Auth (or Clerk)
- Tooling: Git, GitHub, pytest, ruff (lint), black (format)

## Code standards
- Python: type hints everywhere; format with black; lint with ruff; small functions, tested with pytest.
- Reproducible: requirements.txt / pyproject; no hardcoded paths; all config via env vars (.env). NEVER commit secrets or raw data dumps.
- Each model: a training script + an evaluation step (metrics on held-out data, compared to a naive baseline) + the saved artifact logged to MLflow.
- API: FastAPI with Pydantic request/response schemas; one endpoint per service.
- Frontend: componentized; backend base URL from env; no inline secrets.
- Commits: small and focused; always work on a feature branch.

## Build phases (do IN ORDER, one at a time)
1. Data foundation & EDA (Data Analyst) -> dashboard + data dictionary.
2. Data pipeline (Data Engineer) -> ETL into Postgres + feature table.
3. Models (Data Scientist/ML) -> delay, satisfaction, return-risk + review NLP, validated vs baseline.
4. Serving (MLOps) -> FastAPI + Docker + MLflow + monitoring, deployed.
5. AI layer (AI Engineer) -> agent/RAG/tool-calling + evals + guardrails.
6. Web app (Full-stack) -> React UI + auth + dashboard + copilot.
7. Live pipeline & reports -> scheduled refresh, alerts, digests.

## Repo structure (target)
- data/        raw (gitignored) + processed
- notebooks/   EDA
- pipeline/    ETL
- models/      training, evaluation, artifacts
- api/         FastAPI app
- ai/          agent, RAG, evals
- web/         React app
- docs/        vision, requirements, TRD
- tests/

## Commands (fill in as built)
- Install:      pip install -r requirements.txt   (XGBoost on macOS also needs `brew install libomp`)
- Run ETL:      python -m pipeline.run            (Phase 2 — builds the SQLite warehouse; set DATABASE_URL for Postgres)
- Train models: python -m models.train            (Phase 3 — trains/evaluates, writes models/artifacts/ + reports/)
- Run API:      uvicorn api.main:app --reload      (Phase 4 — docs at /docs)
- Build image:  docker build -t veridian-api .     (Phase 4 — needs models/artifacts/ present)
- Tests:        pytest
- Lint/format:  ruff check . && black .

## Guardrails for the agent
- Work on a feature branch; make a checkpoint commit before any large change.
- Never commit .env or data dumps.
- Validate models on held-out data and report metrics honestly (no inflated numbers).
- Ask before destructive actions (deleting files, dropping tables).
