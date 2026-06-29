---
name: run-veridian
description: Build, launch, run, start, and drive the Veridian order-risk platform — the FastAPI backend (delivery-delay & low-review prediction + AI copilot) and the Next.js web app. Use to run/serve Veridian, smoke-test the API, screenshot the web UI, drive the /score flow, or confirm a change works in the real app (not just tests). Driver at .claude/skills/run-veridian/driver.mjs.
---

# run-veridian

Veridian is a full-stack ML "order intelligence" app: a **FastAPI** backend
(`api/main.py`, port 8000) that serves calibrated delivery-delay / low-review
risk models plus an LLM copilot, and a **Next.js 14** web app (`web/`, port
3000) that talks to it. The two run together.

**Primary way to drive it: the Node driver** at
`.claude/skills/run-veridian/driver.mjs`. It launches both servers, runs an API
smoke test (`curl`-style), drives the **installed Google Chrome** headless to
screenshot the pages, and exercises the real `/score` → prediction flow. One
command, full stack, automatic teardown.

> All paths below are **relative to the repo root** (`veridian/`). Verified on
> **macOS** (Apple Silicon, Darwin); Linux deltas are called out where known.

## Prerequisites (already present on this machine)

- **Node ≥ 18** (verified v22.22.3) + **npm** (10.9.8) — for the web app and driver.
- **Python venv** at `.venv` (Python 3.14.5) with deps installed.
- **Google Chrome** (`/Applications/Google Chrome.app`) — the driver drives it
  headless; no chromium download needed.
- Trained models + warehouse are **already in this checkout** (gitignored but
  present): `models/artifacts/*.joblib`, `data/veridian.db` (54 MB SQLite),
  `ai/knowledge_corpus.json`. So the app runs immediately — no training step.

One-time driver setup (installs `playwright-core`, ~1 package, no browser download):

```bash
cd .claude/skills/run-veridian && npm install
```

*Linux note:* xgboost needs OpenMP — `apt-get install -y libgomp1` (per the
Dockerfile). The driver's `channel: 'chrome'` expects Chrome; on a box without it,
run `npx playwright install chromium` and change the channel in `driver.mjs`.

## Run (agent path) — the driver

From the repo root:

```bash
node .claude/skills/run-veridian/driver.mjs all
```

`all` (the default) = start API → API smoke → start web → screenshot
`/`, `/dashboard`, `/score` → click **"Score order"** and assert a risk % renders
→ tear everything down. Expected tail:

```
== API smoke ==
  PASS  GET /health  — models_loaded=["delay","low_review"]
  PASS  GET /models/delay  — roc_auc=0.7845
  PASS  POST /predict/delay  — probability=0.0108 risk=low
  PASS  POST /predict/low-review  — probability=0.0634
  PASS  GET /dashboard  — orders=400
  PASS  GET / (landing)  — title="Veridian — Predict and prevent bad orders"
  PASS  GET /dashboard (page)  — final url=.../dashboard
  PASS  POST /score flow (delay risk renders)  — probability shown=18.1%
✓ ALL CHECKS PASSED
```

Subcommands & flags:

| Command | What it does |
|---|---|
| `driver.mjs api` | Start API only, run the API smoke (hermetic — no network, no LLM). |
| `driver.mjs web` | Start API + web, screenshot the pages, run the `/score` flow. |
| `driver.mjs all` | Both of the above (default). |
| `driver.mjs up`  | Start API + web, print URLs, **stay running** (Ctrl-C to stop). |
| `--copilot` | Also hit `POST /ask` and screenshot `/copilot`. **Makes a real external LLM call** (Groq, via the key in `.env`) — uses quota; degrades gracefully without a key. |
| `--keep` | Leave the servers running after the run instead of tearing down. |
| `--out DIR` | Screenshot output dir (default `.claude/skills/run-veridian/screenshots/`). |

Screenshots land in `.claude/skills/run-veridian/screenshots/` —
`01-landing.png`, `02-dashboard.png`, `03-score-result.png` (and `04-copilot.png`
with `--copilot`). The driver **adopts** an already-running server on 8000/3000
instead of failing, and forces a local-SQLite `DATABASE_URL` so it never touches
the remote DB (see Gotchas).

## Run the API alone (+ curl smoke)

The driver wraps this, but to do it by hand — note the `python -m` form and the
`DATABASE_URL` override (both matter; see Gotchas):

```bash
DATABASE_URL="sqlite:///$(pwd)/data/veridian.db" \
  .venv/bin/python -m uvicorn api.main:app --reload --port 8000
```

Swagger UI at http://127.0.0.1:8000/docs. Smoke it:

```bash
curl -s http://127.0.0.1:8000/health
# {"status":"ok","models_loaded":["delay","low_review"]}

curl -s -X POST http://127.0.0.1:8000/predict/delay -H 'content-type: application/json' -d '{
  "order_purchase_timestamp":"2018-03-10T14:00:00","estimated_delivery_days":25,"n_items":1,
  "total_price":120,"total_freight":20,"customer_seller_distance_km":900,
  "customer_state":"SP","main_seller_state":"RS","primary_payment_type":"credit_card","main_category":"furniture_decor"}'
# {"model":"delay","probability":0.0108,"decision_threshold":0.1529,"flag":false,"risk_level":"low"}

curl -s http://127.0.0.1:8000/dashboard | head -c 120   # summary + 400 scored orders (local SQLite)
```

## Run (human path)

Two terminals; useless headless (a real browser/eyes needed):

```bash
# terminal 1 — API
DATABASE_URL="sqlite:///$(pwd)/data/veridian.db" .venv/bin/python -m uvicorn api.main:app --reload --port 8000
# terminal 2 — web  →  http://localhost:3000
cd web && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

The web app runs in **guest/demo mode** — no login; `/dashboard`, `/score`,
`/copilot` are all reachable directly.

## Direct invocation (for PRs touching internals)

```bash
# tests (30 pass; LLM is mocked) — note the python -m form
DATABASE_URL="sqlite:///$(pwd)/data/veridian.db" .venv/bin/python -m pytest -q

# call a model directly, no server (prints decision_threshold + roc_auc):
.venv/bin/python -c "from api import registry; r=registry.Registry(); r.load(); \
m=r.get('delay'); print(m.threshold, m.meta.get('roc_auc'))"
# 0.1529 0.7845
```

On a **clean clone** the models/warehouse won't exist yet. Rebuilding them is slow
(ETL + XGBoost training) and is **not** exercised by this skill — see the README
"Running it locally": `python -m pipeline.run` → `python -m models.train` →
`python -m ai.index_knowledge`.

## Gotchas

- **The venv's console scripts are broken (stale shebang).** `.venv` was created
  when the repo lived at `/Users/mridhulsudhagona/veridian`; it's now at
  `…/projects/veridian`. So `.venv/bin/uvicorn` / `.venv/bin/pytest` fail with
  `bad interpreter: …/veridian/.venv/bin/python: no such file`. **Always invoke
  via `.venv/bin/python -m <module>`** (`-m uvicorn`, `-m pytest`). The
  `.venv/bin/python` symlink itself is fine. The driver already does this.
- **`.env` points `DATABASE_URL` at a remote Supabase Postgres** (and holds real
  API keys). `pipeline/config.py` uses a *non-overriding* `load_dotenv()`, so an
  **exported** `DATABASE_URL` wins. Export `sqlite:///$(pwd)/data/veridian.db` for
  a fast, offline, self-contained run of `/dashboard` & `/orders` (the driver does
  this automatically). Never print/commit the secrets in `.env`.
- **`/ask` (the copilot) calls a real external LLM** (`groq/llama-3.3-70b-versatile`
  via `.env`). It uses your key/quota and, without a working key, returns HTTP 200
  with a graceful "language model unavailable" fallback. The driver only hits it
  under `--copilot`; core checks stay hermetic.
- **Models/data are gitignored but present here.** `/health` reports
  `models_loaded:["delay","low_review"]` only because the artifacts exist in this
  checkout. A fresh `git clone` has neither.
- **The `/score` page is pre-filled.** The driver just clicks "Score order" and
  reads the result card — no need to fill the form. The probability renders in a
  `p.font-display.text-4xl` element.
- **Driver `node_modules` is local to the skill dir.** Run from elsewhere and you
  get `ERR_MODULE_NOT_FOUND: playwright-core` — that just means `npm install`
  hasn't run in `.claude/skills/run-veridian/`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `bad interpreter: …/veridian/.venv/bin/python` | Use `.venv/bin/python -m uvicorn` / `-m pytest`, not the bare console scripts (stale shebang). |
| `ERR_MODULE_NOT_FOUND` `playwright-core` | `cd .claude/skills/run-veridian && npm install`. |
| Driver hangs / `timed out waiting for http://127.0.0.1:3000` | Next.js first compile is slow on a cold cache — the driver waits 90 s; re-run if a cold install pushed past that. |
| `/dashboard` slow or errors | You're hitting the remote Supabase `DATABASE_URL` from `.env`. Export the local SQLite URL (see Gotchas). |
| Port 8000/3000 already in use | The driver adopts a running server; to reclaim a port: `lsof -ti tcp:8000 \| xargs kill`. |
| `xgboost`/`libgomp` import error (Linux) | `apt-get install -y libgomp1`. |
