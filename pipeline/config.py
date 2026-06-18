"""Pipeline configuration.

All paths are resolved relative to the repository root (the parent of this
package), so the pipeline runs the same regardless of the current working
directory. The database target is read from the ``DATABASE_URL`` environment
variable (optionally via a local ``.env``); if unset, it defaults to a local
SQLite file at ``data/veridian.db`` so the pipeline is runnable with zero
configuration while staying portable to Postgres later.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    # Optional: load a local .env if python-dotenv is available. Never required.
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional
    pass

# Repo root = parent of the `pipeline/` package directory.
ROOT = Path(__file__).resolve().parent.parent

RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

# Default to a local SQLite file; override with DATABASE_URL for Postgres etc.
DEFAULT_SQLITE_PATH = ROOT / "data" / "veridian.db"
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

# Table names written to the warehouse.
ORDERS_TABLE = "orders_order_level"   # cleaned, joined, one row per order
FEATURES_TABLE = "order_features"     # model-ready features + label columns

# Raw CSV filenames (Olist Brazilian E-Commerce dataset).
RAW_FILES = {
    "orders": "olist_orders_dataset.csv",
    "customers": "olist_customers_dataset.csv",
    "items": "olist_order_items_dataset.csv",
    "payments": "olist_order_payments_dataset.csv",
    "reviews": "olist_order_reviews_dataset.csv",
    "products": "olist_products_dataset.csv",
    "sellers": "olist_sellers_dataset.csv",
    "geolocation": "olist_geolocation_dataset.csv",
    "category_translation": "product_category_name_translation.csv",
}
