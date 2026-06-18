"""Veridian ETL pipeline (Phase 2).

Reads the raw Olist CSVs, cleans and joins them into an order-level table,
engineers model-ready features, defines the prediction labels, and loads the
result into a SQL database via SQLAlchemy. DB-agnostic: defaults to a local
SQLite file but switches to Postgres (or anything SQLAlchemy supports) by
setting ``DATABASE_URL`` in the environment / ``.env``.
"""

__all__ = ["config", "extract", "transform", "load", "run"]
