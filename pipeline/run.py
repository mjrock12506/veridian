"""Pipeline entry point.

Full rebuild (default) — extract the raw CSVs, build the cleaned order-level
table, engineer features + labels, and load both into the warehouse (SQLite by
default, Postgres via ``DATABASE_URL``):

    python -m pipeline.run

Incremental run (Phase 7 — live pipeline) — replay only the next slice of
orders and upsert them into the warehouse, so each scheduled run processes just
the new rows:

    python -m pipeline.run --incremental                # next batch
    python -m pipeline.run --incremental --batch-size 5000
    python -m pipeline.run --incremental --reset        # restart the replay

A copy of each table is also written to ``data/processed/`` as CSV for quick
inspection (skip with ``--no-csv``).
"""

from __future__ import annotations

import argparse
import sys
import time

import pandas as pd

from . import config, extract, incremental, load, transform


def build_tables(raw: dict[str, pd.DataFrame] | None = None) -> dict[str, pd.DataFrame]:
    """Extract (unless ``raw`` is provided) + transform. Returns the two
    warehouse tables as DataFrames, keyed by table name."""
    raw = raw if raw is not None else extract.load_raw_tables()
    order_level = transform.build_order_level(raw)

    features = transform.engineer_features(order_level)
    labels = transform.add_labels(order_level)
    feature_table = features.merge(labels, on="order_id", how="left")

    return {
        config.ORDERS_TABLE: order_level,
        config.FEATURES_TABLE: feature_table,
    }


def _write_csv(name: str, df: pd.DataFrame) -> None:
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out = config.PROCESSED_DIR / f"{name}.csv"
    df.to_csv(out, index=False)
    print(f"[etl]   wrote CSV copy -> {out.relative_to(config.ROOT)}")


def run_full(write_csv: bool = True) -> int:
    """Rebuild every warehouse table from scratch (idempotent)."""
    print(f"[etl] database target: {config.DATABASE_URL}")
    print("[etl] mode: FULL rebuild")
    tables = build_tables()
    engine = load.make_engine()
    for name, df in tables.items():
        n = load.load_table(df, name, engine)
        print(f"[etl] loaded {name:20s} {n:>7,} rows x {df.shape[1]} cols")
        if write_csv:
            _write_csv(name, df)
    return 0


def run_incremental(batch_size: int, reset: bool, write_csv: bool = True) -> int:
    """Replay the next slice of orders and upsert it into the warehouse."""
    print(f"[etl] database target: {config.DATABASE_URL}")
    print("[etl] mode: INCREMENTAL replay")
    if reset:
        incremental.reset_state()
        print("[etl] replay state reset")

    raw = extract.load_raw_tables()
    state = incremental.IngestState.load()
    batch, new_state = incremental.select_new_orders(raw["orders"], state, batch_size)
    remaining = incremental.replay_remaining(raw["orders"], new_state)

    if batch.empty:
        print(f"[etl] no new orders to ingest (cursor at {state.cursor:,}); replay complete.")
        return 0

    print(f"[etl] ingesting {len(batch):,} new orders "
          f"(cursor {state.cursor:,} -> {new_state.cursor:,}; {remaining:,} remaining)")

    # Transform only the new slice by passing the filtered orders table.
    raw_slice = {**raw, "orders": batch}
    tables = build_tables(raw_slice)

    engine = load.make_engine()
    for name, df in tables.items():
        n = load.upsert_table(df, name, engine, key="order_id")
        print(f"[etl] upserted {len(df):>6,} rows into {name:20s} (total now {n:,})")
        if write_csv:
            # Re-read the full table so the CSV copy is cumulative, not just the
            # latest slice.
            _write_csv(name, pd.read_sql_table(name, engine))

    new_state.save()
    print(f"[etl] run #{new_state.runs} done; watermark={new_state.last_purchase_ts}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Veridian ETL pipeline (Phase 2 / Phase 7).")
    parser.add_argument(
        "--incremental", action="store_true",
        help="Replay only the next slice of orders and upsert (vs. full rebuild).",
    )
    parser.add_argument(
        "--batch-size", type=int, default=incremental.DEFAULT_BATCH_SIZE,
        help="Orders to ingest per incremental run (default: %(default)s).",
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="Restart the incremental replay from the first order.",
    )
    parser.add_argument(
        "--no-csv", action="store_true",
        help="Skip writing CSV copies to data/processed/.",
    )
    args = parser.parse_args(argv)

    t0 = time.time()
    if args.incremental:
        rc = run_incremental(args.batch_size, args.reset, write_csv=not args.no_csv)
    else:
        rc = run_full(write_csv=not args.no_csv)
    print(f"[etl] done in {time.time() - t0:.1f}s")
    return rc


if __name__ == "__main__":
    sys.exit(main())
