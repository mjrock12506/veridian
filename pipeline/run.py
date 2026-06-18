"""Pipeline entry point.

Run the full ETL with one command:

    python -m pipeline.run

It extracts the raw CSVs, builds the cleaned order-level table, engineers the
feature table (features + labels joined), and loads both into the warehouse
(SQLite by default, Postgres via ``DATABASE_URL``). Re-running rebuilds the
tables from scratch (idempotent). A copy of each table is also written to
``data/processed/`` as CSV for quick inspection.
"""

from __future__ import annotations

import argparse
import sys
import time

import pandas as pd

from . import config, extract, load, transform


def build_tables() -> dict[str, pd.DataFrame]:
    """Extract + transform. Returns the two warehouse tables as DataFrames."""
    raw = extract.load_raw_tables()
    order_level = transform.build_order_level(raw)

    features = transform.engineer_features(order_level)
    labels = transform.add_labels(order_level)
    feature_table = features.merge(labels, on="order_id", how="left")

    return {
        config.ORDERS_TABLE: order_level,
        config.FEATURES_TABLE: feature_table,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Veridian ETL pipeline (Phase 2).")
    parser.add_argument(
        "--no-csv", action="store_true",
        help="Skip writing CSV copies to data/processed/.",
    )
    args = parser.parse_args(argv)

    t0 = time.time()
    print(f"[etl] database target: {config.DATABASE_URL}")
    print("[etl] extracting + transforming ...")
    tables = build_tables()

    engine = load.make_engine()
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    for name, df in tables.items():
        n = load.load_table(df, name, engine)
        print(f"[etl] loaded {name:20s} {n:>7,} rows x {df.shape[1]} cols")
        if not args.no_csv:
            out = config.PROCESSED_DIR / f"{name}.csv"
            df.to_csv(out, index=False)
            print(f"[etl]   wrote CSV copy -> {out.relative_to(config.ROOT)}")

    print(f"[etl] done in {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
