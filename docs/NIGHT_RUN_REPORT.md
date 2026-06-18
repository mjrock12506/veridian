# Night Run Report — Phase 1 (Data Foundation & EDA)

**Date:** 2026-06-17  •  **Branch:** `night-run`  •  **Scope:** Phase 1 only (Data Analyst). No later phase was started.

## Status: ✅ Complete

All Phase 1 objectives from `CLAUDE.md` are done, verified, and committed as
incremental checkpoints.

---

## What I built

| Step | Output | Notes |
|---|---|---|
| 1. Scaffold | `data/`, `notebooks/`, `pipeline/`, `models/`, `api/`, `ai/`, `web/`, `docs/`, `tests/` + `.gitignore` | `.gitignore` excludes `data/raw/`, `data/processed/*`, `.venv/`, `.env`, ML artifacts. |
| 2. Environment | `.venv/` (Python 3.14.5) + pinned `requirements.txt` | pandas 3.0.3, numpy 2.4.6, matplotlib 3.11.0, jupyter 1.1.1, scikit-learn 1.9.0 — all installed and verified to import. |
| 3. Data check | Confirmed | All 9 Olist CSVs present in `data/raw/` (~9 incl. `archive.zip`). Did **not** need to abort. |
| 4. EDA notebook | `notebooks/01_eda_olist.ipynb` (executed, outputs embedded) | Loads all CSVs, joins to a 99,441-row order-level table, profiles data quality, and renders both required charts. |
| 5. Data dictionary | `docs/data_dictionary.md` | Every raw table + every column, the ER overview, and the derived order-level table. |

**Derived artifact:** `data/processed/orders_order_level.csv` (one row per order)
is written by the notebook for Phase 2. It is gitignored (not committed).

**Charts** (embedded in the notebook; PNGs in `notebooks/figures/`, gitignored):
- `delivery_actual_vs_estimated.png` — actual vs. estimated delivery scatter (with on-time parity line) + early/late histogram.
- `review_score_distribution.png` — 1–5★ distribution + mean review score split by on-time vs. late.

---

## Key findings

- **Clean join, no fan-out.** 99,441 orders → exactly 99,441 order-level rows
  (asserted in the notebook). 96,478 are `delivered`.
- **Estimates are heavily padded.** Median *actual* delivery ≈ **10.2 days** vs a
  median *estimate* of ≈ **23.2 days**. Olist quotes conservatively, so most
  orders arrive comfortably early.
- **Late rate ≈ 8.1%** of delivered orders arrive after the customer's estimate.
- **Lateness craters satisfaction** — the headline signal for Phase 3: mean
  review score is **4.29 for on-time** orders but **2.57 for late** ones.
- **Reviews skew positive** but bimodal: mean ≈ **4.09**; 57,008 five-star vs a
  hard 11,363 one-star tail.
- **Missingness is structural, not corruption:** ~3% of orders lack a delivery
  date (undelivered/canceled); ~0.8% have no review; review comment text is
  ~58.7% null. No negative delivery durations or impossible numeric ranges found.

---

## Decisions made (and why)

- **Grain = one row per order.** Aggregated the many-per-order tables
  (`order_items`, `order_payments`) and de-duplicated `reviews` (551 orders had a
  duplicate; kept the latest-answered) *before* joining, so the order count can't
  inflate.
- **Aggregations chosen:** item counts + price/freight sums + modal category;
  payment totals + max installments + highest-value payment type; single review
  score per order. These are sensible order-level features for Phase 2.
- **Timing metrics computed in days** from purchase; `is_late = delivered >
  estimate`. Should be read on `delivered` orders only.
- **Pinned dependency versions** in `requirements.txt` for reproducibility (env
  built and verified on Python 3.14).
- **`geolocation` deliberately not joined** in Phase 1 — it has many lat/lng
  points per ZIP and needs aggregation; reserved for distance features in Phase 2.
- **Source quirks preserved** for traceability: column misspellings
  (`product_name_lenght`, `product_description_lenght`) left as-is.

---

## Verification performed

- Notebook executed end-to-end via `nbconvert --execute`; **0 error outputs**, 2
  charts embedded.
- Row-count assertion (`len(df) == len(orders)`) passes.
- Every figure cited in the dictionary/report was recomputed and confirmed
  (551 duplicate reviews, 58.7% null comments, 96,096 unique customers, 610 null
  categories).
- All five core packages import successfully in the venv.

---

## Needs your review

1. **Two untracked scratch files remain** — `notebooks/_eda_dev.py` and
   `notebooks/_build_nb.py` (used to develop/generate the notebook). I could not
   delete them: `rm` is blocked by this session's permission policy. They are
   **not committed** (untracked). Safe to delete manually: `rm notebooks/_eda_dev.py notebooks/_build_nb.py`.
2. **Python 3.14 + pandas 3.0** — this is a very new stack. Everything works, but
   if you prefer a more battle-tested combo (e.g. Python 3.11 + pandas 2.x) for
   the later ML/serving phases, flag it now and I'll re-pin.
3. **`archive.zip` in `data/raw/`** (~45 MB) is the original Kaggle download
   alongside the extracted CSVs. It's gitignored; delete if not needed.
4. **Branch** — work is on `night-run` with 4 checkpoint commits. Not pushed and
   no PR opened (per CLAUDE.md, I stayed on the feature branch and stopped).

---

## Commits this run (on `night-run`)

1. scaffold repo folders, `.gitignore`, pinned `requirements.txt`
2. executed EDA notebook (join, profile, delivery & review charts)
3. full data dictionary (all 9 raw tables + order-level table)
4. this report

## Suggested next step (Phase 2 — do NOT start without your go-ahead)
Promote the order-level table into a real ETL into Postgres + a feature table,
including the geolocation distance features deferred here.
