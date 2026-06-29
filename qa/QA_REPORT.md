# Veridian — end-to-end QA report

Run: `DATABASE_URL=sqlite:///$(pwd)/data/veridian.db .venv/bin/python qa/qa_business_logic.py`
plus a live Playwright sweep of the deployed app. Test dataset: [`qa/test_orders.csv`](./test_orders.csv).

## Result: 15/15 backend + 8/8 frontend checks pass

### Backend business logic (FastAPI TestClient, real models)
| Check | Result |
|---|---|
| Health + models loaded | ✅ |
| `/score/batch` scores every row, probabilities in [0,1] | ✅ |
| **Delay model is directionally correct** | ✅ |
| Batch summary counts match a manual recompute | ✅ |
| `delay_at_risk_pct` math correct | ✅ |
| ROI/funnel extrapolation is monotonic (sample → full book) | ✅ |
| `/ask` accepts `data_context` (ask-your-data) and returns an answer | ✅ |
| Plain `/ask` (copilot) still works (back-compat) | ✅ |

### Frontend E2E (live, Playwright)
| Flow | Result |
|---|---|
| Dashboard renders live data | ✅ |
| AI actions — **bulk "Approve & send all High" shrinks the queue** | ✅ |
| AI actions — **Export queue downloads a CSV** | ✅ |
| Agentic workflow — full agent run reaches the approval gate, approve → resolved | ✅ |
| Impact & ROI — **sliders recompute the headline** ($631K → $1.44M at max success) | ✅ |
| Score an order — submit returns a live calibrated prediction | ✅ |
| Connect — correctly gated behind sign-in (your-data security) | ✅ |

## Key finding — how the delay model thinks (validated, not a bug)
The delay label is **"delivered later than the *promised* ETA"**, not "shipped slowly". So:

| Order | Estimated ETA | Delay risk |
|---|---|---|
| Tight promise (3 days, far) | 3 days | **27.8%** (medium) |
| Generous promise (40 days, close) | 40 days | **1.1%** (low) |

A tight promise is easy to miss; a generous one is easy to beat. The model captures
this correctly — a useful, non-obvious insight for an ops team setting delivery windows.

## What is REAL vs SIMULATED (important)
**Real and tested:**
- Calibrated XGBoost delay + low-review models (scoring, batch, single).
- Action Center triage, prioritization, playbook selection, bulk approve, CSV export.
- Agentic workflow orchestration logic (score → strategy → draft → routing decision → follow-up).
- ROI math; copilot RAG + "ask your data" grounding (answer quality needs a live LLM key).

**Simulated for the demo (NOT wired to live external systems):**
- The **connectors** (Shopify, Gmail/Outlook, Slack, Google Sheets, Zendesk, HubSpot).
  No real OAuth app is connected, so **no real email is sent, no real Slack message posted,
  no real ticket opened.** The routing step shows *where* an action would go and marks it
  delivered; it does not call those vendors' APIs.
- Inbound data is via **CSV upload** today; live store sync (e.g. "Login with Shopify") is
  the next build.

This is by design for a portfolio demo — wiring even one real connector (e.g. Shopify
inbound or Slack outbound) requires registering an OAuth app with that vendor and storing
per-user tokens. That is the recommended next step to make the loop genuinely live.

## How to test it yourself (simulation)
1. **Public demo (no account):** open the live app → Dashboard, AI actions (try *Approve &
   send all High* and *Export queue*), Agentic workflow (*Run the agents*), Impact & ROI
   (drag the sliders), AI Copilot (ask about the data/metrics), Score an order.
2. **Your own data (needs an account):** enable Supabase Email auth, sign in, open **Connect
   store**, upload [`qa/test_orders.csv`](./test_orders.csv) (or your own export) → see every
   order scored, then use **Ask your data** to query your scored book.
3. **Backend logic:** run `python qa/qa_business_logic.py` for the 15-check business-logic suite.
