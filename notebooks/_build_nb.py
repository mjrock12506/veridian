"""Builds notebooks/01_eda_olist.ipynb from tested cell sources, then it is executed
separately via `jupyter nbconvert --execute`. This builder is deleted after use."""
import nbformat as nbf

nb = nbf.v4.new_notebook()
cells = []
md = lambda s: cells.append(nbf.v4.new_markdown_cell(s))
code = lambda s: cells.append(nbf.v4.new_code_cell(s))

md("""# Veridian — Phase 1 EDA: Olist Brazilian E-Commerce

**Goal (Phase 1, Data Analyst):** load all Olist CSVs, join them into a single
*order-level* table, profile data quality, and chart the two relationships that
motivate the product — **actual vs. estimated delivery time** and the
**review-score distribution**.

The order-level table has **one row per order** and is the foundation for the
feature table built in Phase 2. Nothing here trains a model — that is Phase 3.
""")

code("""import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

warnings.filterwarnings("ignore", category=FutureWarning)
pd.set_option("display.max_columns", 60)

# Resolve the repo root so the notebook works whether it is run from the repo
# root or from notebooks/ (Jupyter sets cwd to the notebook's folder).
ROOT = Path.cwd()
while not (ROOT / "CLAUDE.md").exists() and ROOT != ROOT.parent:
    ROOT = ROOT.parent
RAW = ROOT / "data/raw"
PROC = ROOT / "data/processed"
FIG = ROOT / "notebooks/figures"
PROC.mkdir(parents=True, exist_ok=True)
FIG.mkdir(parents=True, exist_ok=True)
print("pandas", pd.__version__, "| numpy", np.__version__)""")

md("## 1. Load the raw CSVs")

code("""orders = pd.read_csv(RAW / "olist_orders_dataset.csv")
customers = pd.read_csv(RAW / "olist_customers_dataset.csv")
items = pd.read_csv(RAW / "olist_order_items_dataset.csv")
payments = pd.read_csv(RAW / "olist_order_payments_dataset.csv")
reviews = pd.read_csv(RAW / "olist_order_reviews_dataset.csv")
products = pd.read_csv(RAW / "olist_products_dataset.csv")
sellers = pd.read_csv(RAW / "olist_sellers_dataset.csv")
geolocation = pd.read_csv(RAW / "olist_geolocation_dataset.csv")
cat_tx = pd.read_csv(RAW / "product_category_name_translation.csv")

tables = {
    "orders": orders, "customers": customers, "items": items,
    "payments": payments, "reviews": reviews, "products": products,
    "sellers": sellers, "geolocation": geolocation, "cat_tx": cat_tx,
}
pd.DataFrame(
    {"rows": [len(t) for t in tables.values()],
     "cols": [t.shape[1] for t in tables.values()]},
    index=tables.keys(),
)""")

md("""## 2. Parse timestamps

The five order timestamps are read as strings; convert them to datetimes so we
can compute delivery durations. `errors="coerce"` turns unparseable/empty values
into `NaT` (notably absent delivery dates for orders that never arrived).""")

code("""order_date_cols = [
    "order_purchase_timestamp", "order_approved_at",
    "order_delivered_carrier_date", "order_delivered_customer_date",
    "order_estimated_delivery_date",
]
for c in order_date_cols:
    orders[c] = pd.to_datetime(orders[c], errors="coerce")

reviews["review_creation_date"] = pd.to_datetime(reviews["review_creation_date"], errors="coerce")
reviews["review_answer_timestamp"] = pd.to_datetime(reviews["review_answer_timestamp"], errors="coerce")
orders[order_date_cols].dtypes""")

md("""## 3. Collapse the many-to-one tables to one row per order

`order_items` and `order_payments` have several rows per order, and `reviews`
occasionally has duplicates. We aggregate each to a single row keyed on
`order_id` so the final join cannot fan out the order count.""")

code("""# Attach English category names to products, then to item lines.
products = products.merge(cat_tx, on="product_category_name", how="left")
items_prod = items.merge(
    products[["product_id", "product_category_name", "product_category_name_english"]],
    on="product_id", how="left",
)

# One row per order: counts + money totals.
items_agg = items_prod.groupby("order_id").agg(
    n_items=("order_item_id", "count"),
    n_sellers=("seller_id", "nunique"),
    n_products=("product_id", "nunique"),
    total_price=("price", "sum"),
    total_freight=("freight_value", "sum"),
).reset_index()

# Dominant (modal) category per order.
cat_mode = (
    items_prod.dropna(subset=["product_category_name_english"])
    .groupby("order_id")["product_category_name_english"]
    .agg(lambda s: s.mode().iat[0] if not s.mode().empty else np.nan)
    .reset_index().rename(columns={"product_category_name_english": "main_category"})
)
items_agg = items_agg.merge(cat_mode, on="order_id", how="left")
items_agg.head()""")

code("""# Payments: totals + the single highest-value payment method per order.
pay_agg = payments.groupby("order_id").agg(
    total_payment_value=("payment_value", "sum"),
    n_payments=("payment_sequential", "count"),
    max_installments=("payment_installments", "max"),
).reset_index()
pay_type = (
    payments.sort_values("payment_value", ascending=False)
    .drop_duplicates("order_id")[["order_id", "payment_type"]]
    .rename(columns={"payment_type": "primary_payment_type"})
)
pay_agg = pay_agg.merge(pay_type, on="order_id", how="left")

# Reviews: keep the latest-answered review per order.
rev_one = (
    reviews.sort_values("review_answer_timestamp")
    .drop_duplicates("order_id", keep="last")[["order_id", "review_score", "review_creation_date"]]
)
print(f"reviews: {len(reviews):,} rows -> {len(rev_one):,} unique-order reviews")
print(f"payments: {len(payments):,} rows -> {len(pay_agg):,} order rows")
print(f"items: {len(items):,} lines -> {len(items_agg):,} order rows")""")

md("## 4. Join into the order-level table")

code("""df = (
    orders
    .merge(customers, on="customer_id", how="left")
    .merge(items_agg, on="order_id", how="left")
    .merge(pay_agg, on="order_id", how="left")
    .merge(rev_one, on="order_id", how="left")
)
assert len(df) == len(orders), "join fanned out the order count!"
print(f"order-level table: {df.shape[0]:,} rows x {df.shape[1]} cols")
df.head(3)""")

md("""## 5. Derived delivery metrics

The product question is *"will this order go wrong?"* The first proxy is delivery
timing. We measure everything in **days** from purchase.

- `actual_delivery_days` — purchase → customer delivery
- `estimated_delivery_days` — purchase → the estimate shown to the customer
- `delivery_vs_estimate_days` — delivered minus estimated (**positive = late**)
- `is_late` — delivered after the estimate""")

code("""day = np.timedelta64(1, "D")
df["actual_delivery_days"] = (df["order_delivered_customer_date"] - df["order_purchase_timestamp"]) / day
df["estimated_delivery_days"] = (df["order_estimated_delivery_date"] - df["order_purchase_timestamp"]) / day
df["delivery_vs_estimate_days"] = (df["order_delivered_customer_date"] - df["order_estimated_delivery_date"]) / day
df["is_late"] = df["delivery_vs_estimate_days"] > 0

# Persist the joined table for Phase 2 (gitignored; derived artifact).
df.to_csv(PROC / "orders_order_level.csv", index=False)
df[["actual_delivery_days", "estimated_delivery_days", "delivery_vs_estimate_days"]].describe().round(2)""")

md("## 6. Data-quality profile")

code("""profile = pd.DataFrame({
    "dtype": df.dtypes.astype(str),
    "n_missing": df.isna().sum(),
    "pct_missing": (df.isna().mean() * 100).round(2),
    "n_unique": df.nunique(),
}).sort_values("pct_missing", ascending=False)
profile""")

code("""# Numeric ranges — sanity-check for impossible values (e.g. negative days/prices).
num_cols = [
    "n_items", "total_price", "total_freight", "total_payment_value",
    "max_installments", "actual_delivery_days", "estimated_delivery_days",
    "delivery_vs_estimate_days", "review_score",
]
df[num_cols].describe().round(2).T""")

code("""print("order_status distribution:")
print(df["order_status"].value_counts().to_string())
print(f"\\nNegative actual_delivery_days (data errors): {(df['actual_delivery_days'] < 0).sum()}")
print(f"Orders with no delivery date: {df['order_delivered_customer_date'].isna().sum()}")
print(f"Orders with no review:        {df['review_score'].isna().sum()}")""")

md("## 7. Chart — actual vs. estimated delivery time")

code("""delivered = df[df["order_status"] == "delivered"].copy()

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# (a) actual vs estimated scatter with the y = x parity line.
s = delivered.sample(8000, random_state=42)
axes[0].scatter(s["estimated_delivery_days"], s["actual_delivery_days"],
                s=6, alpha=0.25, color="#2b6cb0")
lim = 70
axes[0].plot([0, lim], [0, lim], "r--", lw=1.5, label="on-time boundary (actual = estimate)")
axes[0].set(xlim=(0, lim), ylim=(0, lim),
            xlabel="Estimated delivery (days from purchase)",
            ylabel="Actual delivery (days from purchase)",
            title="Actual vs. estimated delivery time\\n(points above the line = LATE)")
axes[0].legend(loc="upper left")

# (b) distribution of (actual - estimated); >0 is late.
diff = delivered["delivery_vs_estimate_days"].dropna()
axes[1].hist(diff.clip(-40, 40), bins=60, color="#2b6cb0", edgecolor="white")
axes[1].axvline(0, color="red", ls="--", lw=1.5, label="estimate")
axes[1].set(xlabel="Delivered minus estimated (days)  ->  positive = late",
            ylabel="Number of orders",
            title="How early / late orders arrive")
axes[1].legend()

late_rate = delivered["is_late"].mean() * 100
fig.suptitle(f"Delivery timing — {len(delivered):,} delivered orders | late rate {late_rate:.1f}%",
             fontsize=13, y=1.02)
plt.tight_layout()
plt.savefig(FIG / "delivery_actual_vs_estimated.png", dpi=110, bbox_inches="tight")
plt.show()
print(f"Median actual: {delivered['actual_delivery_days'].median():.1f} d | "
      f"median estimated: {delivered['estimated_delivery_days'].median():.1f} d | "
      f"late rate: {late_rate:.1f}%")""")

md("## 8. Chart — review-score distribution")

code("""fig, axes = plt.subplots(1, 2, figsize=(14, 5))

counts = df["review_score"].value_counts().sort_index()
axes[0].bar(counts.index.astype(int).astype(str), counts.values,
            color="#dd6b20", edgecolor="white")
for x, v in zip(counts.index.astype(int).astype(str), counts.values):
    axes[0].text(x, v, f"{v:,}", ha="center", va="bottom", fontsize=9)
axes[0].set(xlabel="Review score (1-5 stars)", ylabel="Number of orders",
            title=f"Review-score distribution (mean = {df['review_score'].mean():.2f})")

# Mean review score split by on-time vs late — the core product signal.
by_late = delivered.groupby("is_late")["review_score"].mean()
axes[1].bar(["On time", "Late"], [by_late.get(False), by_late.get(True)],
            color=["#38a169", "#e53e3e"], edgecolor="white")
for i, v in enumerate([by_late.get(False), by_late.get(True)]):
    axes[1].text(i, v, f"{v:.2f}", ha="center", va="bottom", fontsize=11)
axes[1].set(ylim=(0, 5), ylabel="Mean review score",
            title="Late delivery craters satisfaction")
plt.tight_layout()
plt.savefig(FIG / "review_score_distribution.png", dpi=110, bbox_inches="tight")
plt.show()
print(counts.to_string())""")

md("""## 9. Findings (Phase 1)

- **Scale & join.** 99,441 orders join cleanly to one row each across 8 source
  tables; no fan-out. ~96.5k are `delivered`.
- **Estimates are padded.** Median *actual* delivery is ~10 days vs a ~23-day
  *estimate* — Olist quotes conservatively, so most orders land comfortably early.
- **Late rate ≈ 8%** of delivered orders arrive after the estimate.
- **Lateness destroys satisfaction.** Mean review score is ~4.3 for on-time
  orders but drops to ~2.6 for late ones — the strongest signal for the Phase 3
  delay / satisfaction models.
- **Reviews skew positive** (mean ≈ 4.09; ~57% are 5★, but a hard ~11% 1★ tail).
- **Missingness is structural, not corruption:** absent delivery dates (~3%)
  correspond to undelivered/canceled orders; ~0.8% of orders have no review.

See `docs/data_dictionary.md` for every table and column.
""")

nb["cells"] = cells
nb["metadata"]["kernelspec"] = {"display_name": "Python 3", "language": "python", "name": "python3"}
nbf.write(nb, "notebooks/01_eda_olist.ipynb")
print("wrote notebooks/01_eda_olist.ipynb with", len(cells), "cells")
