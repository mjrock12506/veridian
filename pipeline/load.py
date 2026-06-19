"""Load step: write DataFrames to the SQL warehouse via SQLAlchemy.

DB-agnostic: the engine is built from ``DATABASE_URL`` (SQLite by default,
Postgres when set). Loads use ``if_exists="replace"`` so a re-run fully rebuilds
each table — the pipeline is idempotent (same inputs -> same tables, no append
drift, no duplicate rows).
"""

from __future__ import annotations

import pandas as pd
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from . import config


def make_engine(database_url: str | None = None) -> Engine:
    url = database_url or config.DATABASE_URL
    if url.startswith("sqlite:///"):
        # Ensure the parent dir for the SQLite file exists.
        config.DEFAULT_SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url)


def _prepare_for_sql(df: pd.DataFrame) -> pd.DataFrame:
    """Make a DataFrame safe to write across DB backends.

    pandas' nullable extension dtypes (boolean / Int64) don't always round-trip
    through every DBAPI, so convert them to plain object columns carrying
    Python ``bool``/``int``/``None`` and replace any remaining pandas-NA/NaT
    with ``None``.
    """
    out = df.copy()
    for col in out.columns:
        dtype = out[col].dtype
        if isinstance(dtype, pd.BooleanDtype):
            out[col] = out[col].astype(object).where(out[col].notna(), None)
        elif isinstance(dtype, pd.Int64Dtype):
            out[col] = out[col].astype(object).where(out[col].notna(), None)
    # datetimes -> ISO strings for backend-agnostic storage
    for col in out.select_dtypes(include=["datetime64[ns]", "datetimetz"]).columns:
        out[col] = out[col].astype(object).where(out[col].notna(), None)
        out[col] = out[col].map(lambda v: v.isoformat() if hasattr(v, "isoformat") else v)
    return out


def load_table(df: pd.DataFrame, table_name: str, engine: Engine) -> int:
    """Replace ``table_name`` with the rows of ``df``. Returns row count."""
    prepared = _prepare_for_sql(df)
    prepared.to_sql(table_name, engine, if_exists="replace", index=False, chunksize=5000)
    with engine.connect() as conn:
        n = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one()
    return int(n)


def _table_exists(table_name: str, engine: Engine) -> bool:
    return inspect(engine).has_table(table_name)


def upsert_table(
    df: pd.DataFrame, table_name: str, engine: Engine, key: str = "order_id"
) -> int:
    """Insert ``df``'s rows, replacing any existing rows with the same ``key``.

    Backend-agnostic upsert used by the incremental pipeline: delete the
    incoming keys (if the table already exists), then append. This keeps the
    table free of duplicate orders when a batch is re-run, without relying on
    dialect-specific ``ON CONFLICT`` syntax. Returns the table's total row
    count after the load.
    """
    prepared = _prepare_for_sql(df)
    if prepared.empty:
        if _table_exists(table_name, engine):
            with engine.connect() as conn:
                return int(conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one())
        return 0

    if _table_exists(table_name, engine):
        keys = [k for k in prepared[key].tolist() if k is not None]
        with engine.begin() as conn:
            # Delete in chunks to keep parameter counts within driver limits.
            for i in range(0, len(keys), 500):
                chunk = keys[i : i + 500]
                params = {f"k{j}": v for j, v in enumerate(chunk)}
                placeholders = ", ".join(f":{p}" for p in params)
                conn.execute(
                    text(f"DELETE FROM {table_name} WHERE {key} IN ({placeholders})"),
                    params,
                )
        prepared.to_sql(table_name, engine, if_exists="append", index=False, chunksize=5000)
    else:
        prepared.to_sql(table_name, engine, if_exists="replace", index=False, chunksize=5000)

    with engine.connect() as conn:
        n = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one()
    return int(n)
