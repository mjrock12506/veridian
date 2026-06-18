"""Transform step: clean, join, engineer features, and define labels.

Three public functions, called in order by ``run.py``:

1. :func:`build_order_level`  -> one cleaned row per order (extends the Phase 1
   order-level table with seller + product + geolocation-distance signals).
2. :func:`engineer_features`  -> a model-ready feature frame (calendar parts,
   ratios, encodable categoricals) keyed by ``order_id``.
3. :func:`add_labels`         -> the three prediction targets.

Leakage note: post-outcome fields (actual delivery time, review score) live in
the order-level table for analysis but are deliberately *kept out* of the
feature columns used to predict delay. Phase 3 selects feature subsets per model
(see models/train.py) so the delay model never sees delivery outcomes.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

ORDER_DATE_COLS = [
    "order_purchase_timestamp",
    "order_approved_at",
    "order_delivered_carrier_date",
    "order_delivered_customer_date",
    "order_estimated_delivery_date",
]

EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1, lon1, lat2, lon2):
    """Vectorised great-circle distance (km) between two lat/lon arrays."""
    lat1, lon1, lat2, lon2 = (np.radians(np.asarray(x, dtype="float64"))
                              for x in (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def _geo_centroids(geolocation: pd.DataFrame) -> pd.DataFrame:
    """Mean lat/lng per zip-code prefix (geolocation has many points per prefix)."""
    return (
        geolocation.groupby("geolocation_zip_code_prefix")
        .agg(lat=("geolocation_lat", "mean"), lng=("geolocation_lng", "mean"))
        .reset_index()
        .rename(columns={"geolocation_zip_code_prefix": "zip_prefix"})
    )


def build_order_level(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Join the raw tables into one cleaned row per order."""
    orders = tables["orders"].copy()
    customers = tables["customers"]
    items = tables["items"]
    payments = tables["payments"]
    reviews = tables["reviews"].copy()
    products = tables["products"]
    sellers = tables["sellers"]
    cat_tx = tables["category_translation"]
    geo = _geo_centroids(tables["geolocation"])

    for c in ORDER_DATE_COLS:
        orders[c] = pd.to_datetime(orders[c], errors="coerce")

    # --- Item lines -> order level (counts, money, product physical attrs) ---
    products = products.merge(cat_tx, on="product_category_name", how="left")
    prod_cols = [
        "product_id", "product_category_name", "product_category_name_english",
        "product_weight_g", "product_length_cm", "product_height_cm", "product_width_cm",
    ]
    items_prod = items.merge(products[prod_cols], on="product_id", how="left")
    items_prod["product_volume_cm3"] = (
        items_prod["product_length_cm"]
        * items_prod["product_height_cm"]
        * items_prod["product_width_cm"]
    )

    items_agg = items_prod.groupby("order_id").agg(
        n_items=("order_item_id", "count"),
        n_sellers=("seller_id", "nunique"),
        n_products=("product_id", "nunique"),
        total_price=("price", "sum"),
        total_freight=("freight_value", "sum"),
        avg_product_weight_g=("product_weight_g", "mean"),
        max_product_weight_g=("product_weight_g", "max"),
        avg_product_volume_cm3=("product_volume_cm3", "mean"),
    ).reset_index()

    cat_mode = (
        items_prod.dropna(subset=["product_category_name_english"])
        .groupby("order_id")["product_category_name_english"]
        .agg(lambda s: s.mode().iat[0] if not s.mode().empty else np.nan)
        .reset_index()
        .rename(columns={"product_category_name_english": "main_category"})
    )
    items_agg = items_agg.merge(cat_mode, on="order_id", how="left")

    # --- Seller geography per order (modal seller state + mean ship distance) ---
    items_sell = items[["order_id", "seller_id"]].merge(
        sellers[["seller_id", "seller_state", "seller_zip_code_prefix"]],
        on="seller_id", how="left",
    )
    seller_state_mode = (
        items_sell.dropna(subset=["seller_state"])
        .groupby("order_id")["seller_state"]
        .agg(lambda s: s.mode().iat[0] if not s.mode().empty else np.nan)
        .reset_index()
        .rename(columns={"seller_state": "main_seller_state"})
    )

    # --- Order-level base join ---
    df = orders.merge(customers, on="customer_id", how="left")
    df = df.merge(items_agg, on="order_id", how="left")
    df = df.merge(seller_state_mode, on="order_id", how="left")

    # Payments -> order level
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
    df = df.merge(pay_agg, on="order_id", how="left")

    # One review per order (latest answered)
    reviews["review_creation_date"] = pd.to_datetime(reviews["review_creation_date"], errors="coerce")
    reviews["review_answer_timestamp"] = pd.to_datetime(reviews["review_answer_timestamp"], errors="coerce")
    rev_one = (
        reviews.sort_values("review_answer_timestamp")
        .drop_duplicates("order_id", keep="last")[["order_id", "review_score", "review_creation_date"]]
    )
    df = df.merge(rev_one, on="order_id", how="left")

    assert len(df) == len(orders), "row count must equal number of orders (no fan-out)"

    # --- Customer<->seller shipping distance via geolocation centroids ---
    cust_geo = geo.rename(columns={"lat": "cust_lat", "lng": "cust_lng"})
    df = df.merge(
        cust_geo, left_on="customer_zip_code_prefix", right_on="zip_prefix", how="left"
    ).drop(columns=["zip_prefix"])
    # Per-item distance, averaged to the order (an order can span sellers).
    items_dist = items_sell.merge(
        geo.rename(columns={"lat": "sell_lat", "lng": "sell_lng"}),
        left_on="seller_zip_code_prefix", right_on="zip_prefix", how="left",
    )
    cust_lookup = df[["order_id", "cust_lat", "cust_lng"]]
    items_dist = items_dist.merge(cust_lookup, on="order_id", how="left")
    items_dist["dist_km"] = _haversine_km(
        items_dist["cust_lat"], items_dist["cust_lng"],
        items_dist["sell_lat"], items_dist["sell_lng"],
    )
    dist_agg = (
        items_dist.groupby("order_id")["dist_km"]
        .mean().reset_index().rename(columns={"dist_km": "customer_seller_distance_km"})
    )
    df = df.merge(dist_agg, on="order_id", how="left")

    # --- Derived delivery metrics (analysis fields; some are post-outcome) ---
    day = np.timedelta64(1, "D")
    hour = np.timedelta64(1, "h")
    df["actual_delivery_days"] = (df["order_delivered_customer_date"] - df["order_purchase_timestamp"]) / day
    df["estimated_delivery_days"] = (df["order_estimated_delivery_date"] - df["order_purchase_timestamp"]) / day
    df["delivery_vs_estimate_days"] = (df["order_delivered_customer_date"] - df["order_estimated_delivery_date"]) / day
    df["approval_delay_hours"] = (df["order_approved_at"] - df["order_purchase_timestamp"]) / hour
    df["is_late"] = (df["delivery_vs_estimate_days"] > 0).astype("boolean")
    df.loc[df["order_delivered_customer_date"].isna(), "is_late"] = pd.NA

    return df


# Categorical + numeric feature columns known at (or shortly after) purchase
# time — i.e. usable WITHOUT leaking the delivery/review outcome.
ORDER_TIME_NUMERIC = [
    "estimated_delivery_days",
    "approval_delay_hours",
    "n_items",
    "n_sellers",
    "n_products",
    "total_price",
    "total_freight",
    "freight_ratio",
    "avg_product_weight_g",
    "max_product_weight_g",
    "avg_product_volume_cm3",
    "max_installments",
    "n_payments",
    "customer_seller_distance_km",
    "purchase_month",
    "purchase_dow",
    "purchase_hour",
    "purchase_is_weekend",
    "cross_state_shipment",
]
ORDER_TIME_CATEGORICAL = [
    "main_category",
    "primary_payment_type",
    "customer_state",
    "main_seller_state",
]


def engineer_features(order_level: pd.DataFrame) -> pd.DataFrame:
    """Build the model-ready feature frame (one row per order)."""
    df = order_level
    ts = df["order_purchase_timestamp"]
    out = pd.DataFrame({"order_id": df["order_id"].values})

    # Calendar parts of the purchase timestamp.
    out["purchase_month"] = ts.dt.month.values
    out["purchase_dow"] = ts.dt.dayofweek.values
    out["purchase_hour"] = ts.dt.hour.values
    out["purchase_is_weekend"] = (ts.dt.dayofweek >= 5).astype("int64").values

    # Money / size ratios.
    denom = (df["total_price"].fillna(0) + df["total_freight"].fillna(0)).replace(0, np.nan)
    out["freight_ratio"] = (df["total_freight"] / denom).values
    out["cross_state_shipment"] = (
        (df["customer_state"] != df["main_seller_state"]).astype("int64").values
    )

    passthrough_numeric = [
        "estimated_delivery_days", "approval_delay_hours", "n_items", "n_sellers",
        "n_products", "total_price", "total_freight", "avg_product_weight_g",
        "max_product_weight_g", "avg_product_volume_cm3", "max_installments",
        "n_payments", "customer_seller_distance_km",
    ]
    for col in passthrough_numeric:
        out[col] = df[col].values
    for col in ORDER_TIME_CATEGORICAL:
        out[col] = df[col].values

    return out


def add_labels(order_level: pd.DataFrame) -> pd.DataFrame:
    """Return the three prediction-target columns keyed by order_id.

    - ``is_late``   : delivered after the customer's estimate (delay label).
    - ``low_review``: review score <= 2 (dissatisfaction label).
    - ``is_complaint``: return/complaint proxy — Olist has no returns table, so
      we proxy a "failed / contested order" as a 1-star review OR an order that
      ended ``canceled``/``unavailable``. Documented as a proxy, not ground truth.
    """
    df = order_level
    labels = pd.DataFrame({"order_id": df["order_id"].values})

    labels["is_late"] = df["is_late"].astype("boolean").values

    score = df["review_score"]
    low_review = (score <= 2)
    low_review = low_review.where(score.notna(), other=pd.NA).astype("boolean")
    labels["low_review"] = low_review.values

    failed_status = df["order_status"].isin(["canceled", "unavailable"])
    one_star = (score == 1).fillna(False)
    labels["is_complaint"] = (failed_status | one_star).astype("boolean").values

    # Carry order_status so downstream code can filter to delivered orders.
    labels["order_status"] = df["order_status"].values
    return labels
