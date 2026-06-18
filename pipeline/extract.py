"""Extract step: read the raw Olist CSVs into DataFrames.

Pure I/O — no cleaning or joining happens here. Each raw table is returned
verbatim (date columns are parsed lazily in the transform step) so the extract
step stays cheap and easy to test.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from . import config


def _read(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"Expected raw Olist file not found: {path}\n"
            "Place the Olist CSVs in data/raw/ (see docs/data_dictionary.md)."
        )
    return pd.read_csv(path)


def load_raw_tables(raw_dir: Path | None = None) -> dict[str, pd.DataFrame]:
    """Load every raw Olist CSV. Returns a dict keyed by logical table name."""
    raw_dir = raw_dir or config.RAW_DIR
    return {name: _read(raw_dir / fname) for name, fname in config.RAW_FILES.items()}
