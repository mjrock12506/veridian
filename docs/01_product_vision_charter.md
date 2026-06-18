# Product Vision & Charter — Veridian (Order Intelligence Platform)

**Artifact type:** Product Owner deliverable · **Owner:** Product Owner · **Version:** 1.0 · **Status:** Approved for hand-off to Business Analyst
*(Product name is a placeholder — rename freely; that's the founder's call.)*

---

## 1. Vision statement
Help online retailers stop losing money to bad orders — by predicting which orders will go wrong (late, unhappy, or returned) *before* they do, and telling the retailer exactly what to do about it.

## 2. The problem we are solving
Online retailers learn about late deliveries, dissatisfied customers, and returns only *after* the cost is already locked in (refunds, churn, 1-star reviews, lost repeat sales). They own the operational data that could warn them, but they have no system that turns it into forward-looking, order-level predictions and actions.

## 3. Target users
- **Primary:** Operations / Category Manager at an online retailer — the person responsible for delivery performance and customer experience.
- **Secondary (future):** Marketplace sellers who lack a data team.
- **Portfolio "customer":** the hiring manager evaluating a live, end-to-end build.

## 4. Value proposition (why it matters)
Veridian converts idle operational data into *prevention*: fewer late orders, fewer bad reviews, fewer returns, more retained customers. Critically, it delivers **calibrated, data-specific predictions that a general AI model cannot** — because the models are trained on the business's own data.

## 5. Goals & success metrics
- **North Star:** Net Prevented Loss per 1,000 orders (acted-on predictions that avoid cost).
- **Supporting KPIs:** prediction quality (models beat a naive baseline on held-out data); the tool is live and queryable; recommended actions are adopted.

## 6. Scope (MVP)
**In scope (v1):**
- Per-order risk prediction: delivery delay, customer dissatisfaction, return likelihood
- Customer segmentation and demand forecast
- Review-text insight (NLP)
- A web app: dashboard + AI copilot + "score an order"
- Accounts / SSO, and a scheduled live-update pipeline with reports
- Deployed live (public link)

**Out of scope (v1):** real carrier integrations, live store connectors (Shopify/Woo — future), multi-tenant billing, true streaming.

## 7. High-level product backlog (epics, in priority order)
1. **Data foundation & analysis** — ingest, clean, join, understand the data; first dashboard.
2. **Core prediction models** — delay, satisfaction, and return-risk models (+ review NLP).
3. **Model serving & deployment** — wrap models in an API, containerize, deploy, monitor.
4. **AI copilot & prescriptive layer** — natural-language Q&A and ranked recommendations.
5. **Web app & accounts** — the React frontend, login/SSO, the user-facing features.
6. **Live data pipeline & reports** — scheduled refresh, alerts, digests.

## 8. Stakeholders
Product Owner (sets direction) · the engineering roles you will play next (Business Analyst → Data Analyst → Data Engineer → Data Scientist/ML → MLOps → AI Engineer → Full-stack) · the end user (ops manager) · the evaluator (hiring manager).

## 9. Roadmap
Each epic above is delivered by one or more of the engineering roles, in sequence — which is exactly the build journey we are about to walk, one role at a time.

---
*Hand-off note to the Business Analyst:* take this vision and prioritized backlog and translate epic #1 onward into detailed functional and non-functional requirements with acceptance criteria.
