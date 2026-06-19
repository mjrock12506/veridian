# Deployment guide

This guide takes Veridian from a local clone to a live deployment:

- **Database** — managed Postgres (Supabase or Neon), populated by the pipeline.
- **Backend** — the FastAPI service on **Render** (or HF Spaces), from the
  `Dockerfile` / `render.yaml`.
- **Frontend** — the Next.js app on **Vercel**, from `web/`.
- **Auth** — Supabase Auth (email/password + Google).
- **Live pipeline** — the scheduled GitHub Action that re-runs the ETL and
  emails a risk digest.

Nothing in the repo contains secrets. Every credential below is entered into a
provider's dashboard or GitHub repository secrets. The accounts/keys you need to
create are summarized in [`docs/NEXT_STEPS.md`](NEXT_STEPS.md).

> Throughout, `postgresql+psycopg://…` is the SQLAlchemy URL form the code
> expects. Switching the warehouse from local SQLite to Postgres is **only** a
> change to `DATABASE_URL` — no code changes.

---

## 0. Prerequisites

- The raw Olist dataset (download once from
  [Kaggle](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)) in
  `data/raw/`.
- Python 3.12+ and Node 20+ locally.
- Accounts: Supabase, Render (or HF Spaces), Vercel, GitHub. All have free tiers.

---

## 1. Create the database (Supabase or Neon)

1. Create a Postgres project. Copy its connection string.
2. Convert it to the SQLAlchemy form used here (note the `+psycopg` driver):

   ```
   postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
   ```

3. Populate it from your machine by pointing the pipeline at it:

   ```bash
   export DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME'
   pip install -r requirements.txt
   python -m pipeline.run                 # full build into Postgres
   ```

   This creates the `orders_order_level` and `order_features` tables. Later
   refreshes can be incremental: `python -m pipeline.run --incremental`.

---

## 2. Train the models (one time)

The model artifacts (`models/artifacts/*.joblib`) are **gitignored** and must
exist in the backend's build context. Train them against the populated DB:

```bash
python -m models.train     # writes models/artifacts/ + reports/
```

To make them available to Render's Docker build, either:

- **Simplest:** commit them to your deploy branch, overriding the ignore:

  ```bash
  git add -f models/artifacts/delay_model.joblib models/artifacts/low_review_model.joblib
  git commit -m "deploy: include trained model artifacts"
  ```

  (~6 MB total. Fine for a portfolio; for a real system use object storage.)

- **Or** add a build step that trains them (needs the dataset + DB at build
  time).

Without the artifacts the API still boots; `/predict/*`, `/dashboard`, and
`/orders/*` return a clear `503` until they're present.

---

## 3. Deploy the backend (Render)

The repo ships `render.yaml` (a Docker web service) and a `Dockerfile`.

1. In Render: **New → Blueprint**, connect this repo. Render reads `render.yaml`.
2. Set the service's environment variables (all `sync: false`, entered in the
   dashboard):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your `postgresql+psycopg://…` string from step 1 |
   | `CORS_ORIGINS` | your Vercel URL(s), comma-separated, e.g. `https://veridian.vercel.app` |
   | `LLM_MODEL`, `GEMINI_API_KEY`, … | optional — only if you enable the AI copilot (see step 6) |

3. Deploy. Render builds the image, runs `uvicorn api.main:app` on its `$PORT`,
   and health-checks `/health`.
4. Verify: `curl https://YOUR-SERVICE.onrender.com/health` →
   `{"status":"ok","models_loaded":["delay","low_review"]}`.

**HF Spaces alternative:** create a *Docker* Space, push the repo, and set the
same variables as Space secrets. The `Dockerfile` honors `$PORT` (Spaces uses
7860), so no changes are needed.

---

## 4. Configure Supabase Auth

1. Supabase → **Authentication → Providers**: enable **Email** and **Google**
   (for Google, paste an OAuth client ID/secret from the Google Cloud console).
2. Supabase → **Authentication → URL Configuration**:
   - **Site URL:** your Vercel URL (e.g. `https://veridian.vercel.app`).
   - **Redirect URLs:** add `https://veridian.vercel.app/auth/callback` and,
     for local dev, `http://localhost:3000/auth/callback`.
3. Supabase → **Settings → API**: copy the **Project URL** and **anon public**
   key for the next step.

---

## 5. Deploy the frontend (Vercel)

1. Vercel → **New Project**, import this repo.
2. Set **Root Directory** to `web` (the app lives there; `web/vercel.json` is
   picked up from it).
3. Add environment variables (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | your Render backend URL |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL (step 4) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (step 4) |

4. Deploy. Open the site: the landing page is public; `/dashboard`, `/copilot`,
   `/score`, and `/orders` require sign-in. (If the Supabase vars are omitted,
   the app still runs and shows an "auth not configured" banner.)
5. Back in **Render**, make sure `CORS_ORIGINS` includes this Vercel URL.

---

## 6. (Optional) Enable the AI copilot

The slim backend image omits the LLM/RAG dependencies, so `/ask` returns `503`.
To enable the copilot:

1. Build the image from the full `requirements.txt` (not `requirements-api.txt`)
   and build the vector store at deploy time (`python -m ai.index_knowledge`).
2. Set `LLM_MODEL` and the matching provider key (`GEMINI_API_KEY`,
   `ANTHROPIC_API_KEY`, or `GROQ_API_KEY`) on the backend service.

See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) and `ai/` for details.

---

## 7. Enable the live pipeline (GitHub Actions)

`.github/workflows/live-pipeline.yml` runs daily (and on demand) to ingest the
next slice of orders incrementally and email a risk digest. Add these as
**repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | the production Postgres URL (so the cron writes to it) |
| `OLIST_DATA_URL` *or* `KAGGLE_USERNAME` + `KAGGLE_KEY` | source of the raw dataset in CI |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | email transport (any provider) |
| `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` | digest sender / recipients |

Run it once manually (**Actions → live-pipeline → Run workflow**) to confirm.
Without the SMTP/recipient secrets the digest is still produced and uploaded as
a build artifact; only the email is skipped. The warehouse and replay cursor are
carried between runs via the Actions cache.

---

## 8. Smoke test the live system

```bash
# Backend
curl https://YOUR-SERVICE.onrender.com/health
curl -X POST https://YOUR-SERVICE.onrender.com/predict/delay \
  -H 'Content-Type: application/json' \
  -d '{"estimated_delivery_days":12,"customer_state":"SP","main_seller_state":"SP","total_price":120,"total_freight":35,"n_items":1}'
```

- Frontend: sign up, confirm the dashboard loads data from the backend.
- CI: confirm both `ci` and `live-pipeline` workflows are green.

---

## Environment variable reference

`.env.example` documents **every** variable and which component reads it. Quick
map:

| Component | Reads |
|---|---|
| Pipeline / API | `DATABASE_URL` |
| API (CORS) | `CORS_ORIGINS`, `PORT` (host-injected) |
| AI copilot | `LLM_MODEL`, `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` |
| Frontend (Vercel) | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Reports/alerts | `SMTP_*`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` |
| CI data | `OLIST_DATA_URL` or `KAGGLE_USERNAME` + `KAGGLE_KEY` |
