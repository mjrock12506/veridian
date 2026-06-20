# Veridian API — serving image (backend for Render / HF Spaces / any Docker host).
#
# Build:  docker build -t veridian-api .
# Run:    docker run --rm -p 8000:8000 -e DATABASE_URL=... veridian-api
# Then:   curl localhost:8000/health   ->  {"status":"ok",...}
#
# Serves /health, /predict/*, /dashboard, /orders/* and /ask (the AI copilot).
# /ask needs an LLM provider key at runtime (e.g. GROQ_API_KEY / GEMINI_API_KEY);
# without one it returns a clean, graceful fallback. See docs/DEPLOYMENT.md.
#
# RUNTIME INPUTS (provided at deploy time, never baked secrets):
#   - DATABASE_URL  : warehouse connection. SQLite by default; set a Postgres
#                     URL in production. The warehouse must be populated by the
#                     pipeline (python -m pipeline.run) before /dashboard works.
#   - CORS_ORIGINS  : comma-separated allowed browser origins (the web app URL).
#   - models/artifacts/*.joblib : trained models. These are gitignored, so run
#                     `python -m models.train` so they exist in the build
#                     context before building (see docs/DEPLOYMENT.md).

FROM python:3.12-slim

# libgomp1 provides the OpenMP runtime that the XGBoost wheel links against.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install serving deps first for better layer caching.
COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt

# App code. `pipeline` is imported by the dashboard for its config/DB URL;
# `ai` powers the /ask copilot (its TF-IDF knowledge corpus is committed in the
# package, so no docs/ or vector DB is needed at runtime);
# reports/shap_delay.json powers the order drill-down's top drivers.
COPY api/ ./api/
COPY ai/ ./ai/
COPY pipeline/ ./pipeline/
COPY models/artifacts/ ./models/artifacts/
COPY reports/shap_delay.json ./reports/shap_delay.json

# Non-root runtime user.
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Container-friendly healthcheck against the API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request,sys; p=os.environ.get('PORT','8000'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{p}/health').status==200 else 1)"

# Honor the platform's $PORT (Render/HF set it); default to 8000 locally.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
