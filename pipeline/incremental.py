"""Incremental ingestion: replay the Olist orders as if they arrived over time.

The full pipeline (``run.py`` without ``--incremental``) rebuilds every table
from scratch. For a *live* pipeline we instead want to process only new rows on
each run. Olist is a static historical dump, so to simulate a stream we order
all orders chronologically (by purchase timestamp) and advance a cursor by a
fixed batch on every run — each run "sees" the next slice of orders as if they
had just come in.

A small JSON state file (``data/state/ingest_state.json``) records the cursor so
successive runs pick up where the last left off. In CI the state file (and the
SQLite warehouse) are carried between scheduled runs via ``actions/cache``; a
cache miss simply starts the replay from the beginning. Nothing here is
specific to SQLite vs. Postgres — the warehouse target is still ``DATABASE_URL``.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass

import pandas as pd

from . import config

STATE_DIR = config.ROOT / "data" / "state"
STATE_FILE = STATE_DIR / "ingest_state.json"

# Orders processed per run. Chosen so the ~99k-order dataset replays over a
# few dozen runs — enough to show growth without finishing in one shot.
DEFAULT_BATCH_SIZE = 2000

# Deterministic chronological ordering of the replay.
_SORT_COLS = ["order_purchase_timestamp", "order_id"]


@dataclass
class IngestState:
    cursor: int = 0          # how many orders have been ingested so far
    runs: int = 0            # number of incremental runs executed
    last_purchase_ts: str | None = None  # watermark of the most recent batch

    @classmethod
    def load(cls) -> "IngestState":
        if STATE_FILE.exists():
            data = json.loads(STATE_FILE.read_text())
            return cls(**{k: data.get(k) for k in ("cursor", "runs", "last_purchase_ts")})
        return cls()

    def save(self) -> None:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(asdict(self), indent=2) + "\n")


def reset_state() -> None:
    """Forget the replay cursor so the next run starts from the first order."""
    if STATE_FILE.exists():
        STATE_FILE.unlink()


def select_new_orders(
    all_orders: pd.DataFrame,
    state: IngestState,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> tuple[pd.DataFrame, IngestState]:
    """Return the next chronological slice of orders and the advanced state.

    The returned frame is the subset of ``all_orders`` to ingest this run
    (possibly empty when the replay is exhausted). The new state's cursor points
    just past the slice.
    """
    ordered = all_orders.copy()
    ordered["_sort_ts"] = pd.to_datetime(
        ordered["order_purchase_timestamp"], errors="coerce"
    )
    ordered = ordered.sort_values(
        ["_sort_ts", "order_id"], na_position="last"
    ).reset_index(drop=True)

    start = max(0, int(state.cursor or 0))
    end = min(len(ordered), start + batch_size)
    batch = ordered.iloc[start:end].drop(columns=["_sort_ts"])

    watermark = state.last_purchase_ts
    if not batch.empty:
        ts = pd.to_datetime(batch["order_purchase_timestamp"], errors="coerce").max()
        watermark = None if pd.isna(ts) else ts.isoformat()

    new_state = IngestState(
        cursor=end,
        runs=(state.runs or 0) + 1,
        last_purchase_ts=watermark,
    )
    return batch, new_state


def replay_remaining(all_orders: pd.DataFrame, state: IngestState) -> int:
    """How many orders are still waiting to be replayed after ``state``."""
    return max(0, len(all_orders) - int(state.cursor or 0))
