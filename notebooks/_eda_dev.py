"""Dev scratch script to validate the EDA logic before embedding into the notebook.

Run with: .venv/bin/python notebooks/_eda_dev.py
This is NOT the deliverable; notebooks/01_eda_olist.ipynb is. Deleted after dev.
"""
from pathlib import Path
import pandas as pd
import numpy as np

RAW = Path("data/raw")
PROC = Path("data/processed")
FIG = Path("notebooks/figures")
PROC.mkdir(parents=True, exist_ok=True)
FIG.mkdir(parents=True, exist_ok=True)

# ---- Load ----
orders = pd.read_csv(RAW / "olist_orders_dataset.csv")
customers = pd.read_csv(RAW / "olist_customers_dataset.csv")
items = pd.read_csv(RAW / "olist_order_items_dataset.csv")
payments = pd.read_csv(RAW / "olist_order_payments_dataset.csv")
reviews = pd.read_csv(RAW / "olist_order_reviews_dataset.csv")
products = pd.read_csv(RAW / "olist_products_dataset.csv")
sellers = pd.read_csv(RAW / "olist_sellers_dataset.csv")
cat_tx = pd.read_csv(RAW / "product_category_name_translation.csv")

print("row counts:")
for name, df in [
    ("orders", orders), ("customers", customers), ("items", items),
    ("payments", payments), ("reviews", reviews), ("products", products),
    ("sellers", sellers), ("cat_tx", cat_tx),
]:
    print(f"  {name:10s} {df.shape}")

# ---- Parse dates ----
order_date_cols = [
    "order_purchase_timestamp", "order_approved_at",
    "order_delivered_carrier_date", "order_delivered_customer_date",
    "order_estimated_delivery_date",
]
for c in order_date_cols:
    orders[c] = pd.to_datetime(orders[c], errors="coerce")

# ---- Aggregate item lines to order level ----
products = products.merge(cat_tx, on="product_category_name", how="left")
items_prod = items.merge(
    products[["product_id", "product_category_name", "product_category_name_english"]],
    on="product_id", how="left",
)
items_agg = items_prod.groupby("order_id").agg(
    n_items=("order_item_id", "count"),
    n_sellers=("seller_id", "nunique"),
    n_products=("product_id", "nunique"),
    total_price=("price", "sum"),
    total_freight=("freight_value", "sum"),
).reset_index()
# dominant category per order (mode)
cat_mode = (
    items_prod.dropna(subset=["product_category_name_english"])
    .groupby("order_id")["product_category_name_english"]
    .agg(lambda s: s.mode().iat[0] if not s.mode().empty else np.nan)
    .reset_index()
    .rename(columns={"product_category_name_english": "main_category"})
)
items_agg = items_agg.merge(cat_mode, on="order_id", how="left")

# ---- Aggregate payments to order level ----
pay_agg = payments.groupby("order_id").agg(
    total_payment_value=("payment_value", "sum"),
    n_payments=("payment_sequential", "count"),
    max_installments=("payment_installments", "max"),
).reset_index()
# primary (highest-value) payment type per order
pay_type = (
    payments.sort_values("payment_value", ascending=False)
    .drop_duplicates("order_id")[["order_id", "payment_type"]]
    .rename(columns={"payment_type": "primary_payment_type"})
)
pay_agg = pay_agg.merge(pay_type, on="order_id", how="left")

# ---- One review per order (latest answer) ----
reviews["review_creation_date"] = pd.to_datetime(reviews["review_creation_date"], errors="coerce")
reviews["review_answer_timestamp"] = pd.to_datetime(reviews["review_answer_timestamp"], errors="coerce")
rev_one = (
    reviews.sort_values("review_answer_timestamp")
    .drop_duplicates("order_id", keep="last")[["order_id", "review_score", "review_creation_date"]]
)
print(f"\nreviews: {len(reviews)} rows, {reviews['order_id'].nunique()} unique orders -> {len(rev_one)} kept")

# ---- Build order-level table ----
df = orders.merge(customers, on="customer_id", how="left")
df = df.merge(items_agg, on="order_id", how="left")
df = df.merge(pay_agg, on="order_id", how="left")
df = df.merge(rev_one, on="order_id", how="left")
print(f"\norder-level table: {df.shape}")
assert len(df) == len(orders), "row count must equal number of orders (no fan-out)"

# ---- Derived delivery metrics ----
day = np.timedelta64(1, "D")
df["actual_delivery_days"] = (df["order_delivered_customer_date"] - df["order_purchase_timestamp"]) / day
df["estimated_delivery_days"] = (df["order_estimated_delivery_date"] - df["order_purchase_timestamp"]) / day
df["delivery_vs_estimate_days"] = (df["order_delivered_customer_date"] - df["order_estimated_delivery_date"]) / day
df["is_late"] = df["delivery_vs_estimate_days"] > 0

# ---- Data quality profile ----
miss = pd.DataFrame({
    "dtype": df.dtypes.astype(str),
    "n_missing": df.isna().sum(),
    "pct_missing": (df.isna().mean() * 100).round(2),
}).sort_values("pct_missing", ascending=False)
print("\nmissingness (top 15):")
print(miss.head(15).to_string())

delivered = df[df["order_status"] == "delivered"]
print(f"\norder_status counts:\n{df['order_status'].value_counts().to_string()}")
print(f"\ndelivered orders: {len(delivered)}")
print(f"late rate (delivered): {delivered['is_late'].mean()*100:.1f}%")
print(f"median actual delivery days: {delivered['actual_delivery_days'].median():.1f}")
print(f"median estimated delivery days: {delivered['estimated_delivery_days'].median():.1f}")
print(f"\nreview score distribution:\n{df['review_score'].value_counts().sort_index().to_string()}")
print(f"mean review score: {df['review_score'].mean():.3f}")

# late vs review correlation sanity
print("\nmean review score by is_late (delivered):")
print(delivered.groupby("is_late")["review_score"].mean().to_string())

print("\nOK — EDA logic validated.")
