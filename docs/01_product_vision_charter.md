# Product Vision & Charter — Veridian (Order Intelligence Platform)

**Version:** 1.0 · **Status:** Approved

---

## 1. Vision statement

Help online retailers reduce the cost of bad orders by predicting which orders
will go wrong — late, unsatisfactory, or returned — before they do, and
recommending the action to take.

## 2. The problem

Online retailers learn about late deliveries, dissatisfied customers, and returns
only after the cost is already incurred: refunds, churn, low review scores, and
lost repeat sales. They own the operational data that could warn them, but lack a
system that turns it into forward-looking, order-level predictions and actions.

## 3. Target users

- **Primary:** operations or category managers responsible for delivery
  performance and customer experience at an online retailer.
- **Secondary (future):** marketplace sellers without a dedicated data team.

## 4. Value proposition

Veridian converts idle operational data into prevention: fewer late orders, fewer
poor reviews, fewer returns, and more retained customers. Because the models are
trained on the business's own data, they produce calibrated, data-specific
predictions that a general-purpose model cannot.

## 5. Goals & success metrics

- **North Star:** net prevented loss per 1,000 orders — acted-on predictions that
  avoid cost.
- **Supporting metrics:** models beat a naive baseline on held-out data; the tool
  is live and queryable; recommended actions are adopted.

## 6. Scope (MVP)

**In scope (v1):**

- Per-order risk prediction: delivery delay, customer dissatisfaction, return
  likelihood
- Customer segmentation and demand forecast
- Review-text insight (NLP)
- A web app: dashboard, AI copilot, and "score an order"
- Accounts / SSO, and a scheduled live-update pipeline with reports
- A deployed, publicly reachable build

**Out of scope (v1):** real carrier integrations, live store connectors
(Shopify/Woo), multi-tenant billing, and true streaming.

## 7. Product backlog (epics, in priority order)

1. **Data foundation & analysis** — ingest, clean, join, and understand the data;
   first dashboard.
2. **Core prediction models** — delay, satisfaction, and return-risk models, plus
   review NLP.
3. **Model serving & deployment** — wrap models in an API, containerize, deploy,
   and monitor.
4. **AI copilot & prescriptive layer** — natural-language Q&A and ranked
   recommendations.
5. **Web app & accounts** — React frontend, login/SSO, and user-facing features.
6. **Live data pipeline & reports** — scheduled refresh, alerts, and digests.

## 8. Stakeholders

Product direction, the engineering disciplines that deliver each epic (business
analysis → data analysis → data engineering → data science / ML → MLOps → AI
engineering → full-stack), and the end user (operations manager).

## 9. Roadmap

Each epic is delivered by one or more engineering disciplines, in sequence. The
build proceeds one layer at a time, with a defined deliverable handed off between
disciplines — see [`role_communications.md`](role_communications.md).
