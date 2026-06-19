# Next steps — what's built, and what I need from you to go live

This file is the handoff. Everything below is implemented, tested, and committed
on the `phase-2` branch (not pushed). To actually deploy, I need a few accounts
and keys that only you can create — listed at the end.

---

## What was built (Phases 6C, 7, and deployment prep)

### Phase 6C — Authentication (web app)
- Supabase Auth wired into the Next.js app via `@supabase/ssr`: **email/password
  + Google SSO**.
- App routes `/dashboard`, `/copilot`, `/score`, `/orders` are protected by
  `web/middleware.ts` (server-side redirect to `/login`, preserving the intended
  destination). The landing page stays public.
- `/login` (sign-in/sign-up + Google), `/auth/callback` (OAuth code exchange),
  and a sign-out user menu in the sidebar/mobile nav.
- Fully env-driven: reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  **When they're absent the app still runs locally** and shows a clear
  "auth not configured" state. Nothing is hardcoded.

### Phase 7 — Live pipeline & reports
- **Incremental ETL**: `python -m pipeline.run --incremental` replays the Olist
  orders in chronological order via a cursor (`data/state/`), ingesting only the
  next slice each run (simulated "new data"). Loads use a backend-agnostic
  upsert keyed on `order_id`, so re-runs never duplicate rows.
- **Reports/alerts**: `python -m pipeline.report` writes a risk digest
  (counts + top at-risk orders) to `reports/digests/` and can email it over
  provider-agnostic SMTP (env-driven; skipped cleanly if unset). It degrades to
  observed labels when models aren't trained.
- **GitHub Actions**:
  - `live-pipeline.yml` — daily cron: incremental ETL → ensure models → digest →
    upload artifact / optional email. Warehouse + cursor persist across runs via
    the Actions cache.
  - `ci.yml` — runs pytest and the web build on push/PR.

### Deployment prep (config + docs only — nothing deployed)
- `Dockerfile` serves the full core API (`/predict/*`, `/dashboard`, `/orders`),
  honors the host `$PORT`, and copies the pieces the dashboard needs.
- `render.yaml` (backend blueprint) and `web/vercel.json` (frontend).
- `DATABASE_URL` switches SQLite → Postgres with no code changes (verified).
- `.env.example` documents **every** variable; `docs/DEPLOYMENT.md` is the
  step-by-step runbook.

### Verification
- `pytest` — **28 passing** (model/AI tests skip when artifacts/index absent).
- `cd web && npm run build` — clean production build (middleware + `/login`
  compiled).
- API smoke test (`/health`, `/dashboard`) returns 200 with models loaded.

---

## What I need from you to go live

I stopped here because the rest requires accounts/keys only you can provision.
None of these are in the repo. Full instructions for each are in
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md).

1. **Postgres database** (Supabase or Neon)
   - Create the project and give me / set the `DATABASE_URL` in the form
     `postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME`.

2. **Supabase Auth** (can be the same Supabase project)
   - Enable Email + Google providers (Google needs an OAuth client ID/secret
     from Google Cloud).
   - Add redirect URLs for your Vercel domain and `localhost:3000`.
   - Provide the **Project URL** and **anon public key** for the frontend
     (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

3. **Render account** (backend hosting)
   - Connect the repo as a Blueprint; set `DATABASE_URL` and `CORS_ORIGINS`
     (your Vercel URL) in the dashboard.

4. **Vercel account** (frontend hosting)
   - Import the repo with **Root Directory = `web`**; set `NEXT_PUBLIC_API_URL`
     (Render URL) and the two Supabase vars.

5. **Dataset access for CI** (one of)
   - `OLIST_DATA_URL` (a zip of the Olist CSVs you host), **or**
   - `KAGGLE_USERNAME` + `KAGGLE_KEY` (Kaggle API token).
   - Added as GitHub repository secrets.

6. **Email/SMTP for digests** (optional)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`,
     `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` (any provider: SendGrid, Gmail, SES…).
   - Added as GitHub repository secrets.

7. **(Optional) AI copilot LLM key**
   - `LLM_MODEL` + the matching provider key (`GEMINI_API_KEY` /
     `ANTHROPIC_API_KEY` / `GROQ_API_KEY`) if you want `/ask` live. Requires
     building the backend from the full `requirements.txt` (see DEPLOYMENT.md §6).

### One decision for you
- **Model artifacts in the image:** `models/artifacts/*.joblib` are gitignored.
  The simplest path to a working backend is to force-add them on your deploy
  branch (`git add -f`, ~6 MB) after running `python -m models.train`. If you'd
  prefer object storage or a build-time training step instead, tell me and I'll
  wire it up.

---

## Run it locally right now (no accounts needed)

```bash
# Backend
pip install -r requirements.txt
python -m pipeline.run            # build the local SQLite warehouse
python -m models.train            # train models (writes models/artifacts/)
uvicorn api.main:app --reload     # http://localhost:8000/docs

# Frontend (auth disabled, shows the "not configured" banner)
cd web && npm install && npm run dev   # http://localhost:3000

# Live-pipeline pieces
python -m pipeline.run --incremental --reset   # start the replay
python -m pipeline.report --stdout             # generate a digest
```
