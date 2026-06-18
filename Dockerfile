# Veridian prediction API — serving image (Phase 4, build only).
#
# Build:  docker build -t veridian-api .
# Run:    docker run --rm -p 8000:8000 veridian-api
# Then:   curl localhost:8000/health
#
# NOTE: the model artifacts in models/artifacts/ are gitignored and baked into
# the image at build time. Run `python -m models.train` first to produce them.

FROM python:3.14-slim

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

# App code + trained model artifacts.
COPY api/ ./api/
COPY models/artifacts/ ./models/artifacts/

# Non-root runtime user.
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Container-friendly healthcheck against the API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
