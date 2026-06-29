# Veridian — product overview

Veridian is an order-intelligence app for e-commerce operations teams. The moment
an order is placed it predicts whether the order will be **delivered late** or
earn a **low (1–2 star) review**, so the team can act before the cost is locked in
(refunds, churn, bad ratings). It is built on the Olist Brazilian e-commerce
dataset (~100k real orders, 2016–2018) and two calibrated machine-learning models.

## What you can do (pages)

- **Dashboard** — every order scored and ranked riskiest-first, with portfolio
  stats (orders scored, % delay at-risk, % low-review at-risk, high-risk count).
  Start here to see the whole order book at a glance.
- **AI Action Center** — the AI triages every at-risk order by priority
  (High / Medium), recommends a playbook per order (e.g. *expedite shipping*,
  *proactive support outreach*, *confirm the delivery ETA*), and **drafts the
  customer message for you**. You review and edit the draft, then send — nothing
  is sent automatically and Veridian never messages customers directly. An
  **auto-pilot** can work the queue; the resolved count and coverage update live.
  Use it each morning to clear the highest-risk orders fast.
- **Customer Segments** — buyers grouped by lifetime value and loyalty (Champions,
  High-value first-timers, Loyal regulars, One-time buyers), each with a
  recommended retention action and revenue share.
- **Demand Forecast** — monthly order volume with a transparent trend projection
  and an uncertainty band.
- **Score an order** — enter an order's fields and get the calibrated delay and
  low-review probabilities instantly.
- **Connect your store** — export your orders from Shopify, Amazon Seller Central,
  or any platform as a CSV and upload it to score every order with the same
  models. A free account is required; your data is processed in the browser and
  never stored.

## How a team gets value

A typical morning: open the Dashboard to see how many orders are flagged, then go
to the AI Action Center, run auto-pilot or work the High-priority queue, review
and send the drafted messages, and resolve them — turning a risk score into a save
before the customer is let down.

## The two models

- **Delay model** — will the order be delivered after the customer's estimate?
  Uses only order-time features (ROC-AUC ≈ 0.78).
- **Low-review model** — will the customer leave a 1–2 star review? (ROC-AUC ≈ 0.76).

Both are isotonic-calibrated, so a "30%" really happens about 30% of the time —
the probabilities are trustworthy, not just ranked.
