"""Builds the grounded knowledge corpus that the RAG layer indexes.

Two kinds of documents, both derived from artifacts already in the repo so they
cannot drift from reality:

1. **Schema / definitions** — chunked from ``docs/data_dictionary.md`` and
   ``docs/MODEL_CARD.md`` (the dataset structure, label rules, methodology).
2. **Authoritative statistics** — generated from ``reports/metrics_*.json`` at
   index time, so every figure the copilot can cite is a real measured value.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from ai import config

DOCS = config.ROOT / "docs"
REPORTS = config.ROOT / "reports"


@dataclass
class Document:
    id: str
    text: str
    source: str


def _chunk_markdown(path: Path, source: str) -> list[Document]:
    """Split a markdown file into one chunk per level-2 (``##``) section."""
    if not path.exists():
        return []
    lines = path.read_text().splitlines()
    docs: list[Document] = []
    header = "(preamble)"
    buf: list[str] = []
    idx = 0

    def flush() -> None:
        nonlocal idx, buf
        body = "\n".join(buf).strip()
        if body:
            docs.append(Document(id=f"{source}#{idx}", text=f"{header}\n{body}".strip(), source=source))
            idx += 1

    for ln in lines:
        if ln.startswith("## "):
            flush()
            header = ln.lstrip("# ").strip()
            buf = []
        else:
            buf.append(ln)
    flush()
    return docs


def _stats_documents() -> list[Document]:
    """Compact, authoritative metric summaries built from the metrics JSON."""
    docs: list[Document] = []
    titles = {"delay": "delivery-delay", "low_review": "low-review (1-2 star) satisfaction"}
    for name, title in titles.items():
        p = REPORTS / f"metrics_{name}.json"
        if not p.exists():
            continue
        m = json.loads(p.read_text())
        rm = m["ranking_metrics"]
        tt = m["at_tuned_threshold"]
        nb = m["naive_baseline"]
        text = (
            f"Model '{name}' — {title} risk. "
            f"Held-out test set: {m['n_test']:,} orders; positive base rate "
            f"{m['positive_base_rate']:.1%}. "
            f"Train {m['train_size']:,} / validation {m['val_size']:,} / test {m['n_test']:,}. "
            f"ROC-AUC {rm['roc_auc']}, PR-AUC {rm['pr_auc']}, "
            f"Brier {rm['brier_score']} (uncalibrated {m.get('uncalibrated_brier')}). "
            f"At the validation-tuned threshold {m['tuned_threshold']}: precision "
            f"{tt['precision']}, recall {tt['recall']}, F1 {tt['f1']}, accuracy {tt['accuracy']}. "
            f"Majority-class baseline accuracy {nb['accuracy']}, recall on positives "
            f"{nb['recall_on_positive']}. Probabilities are isotonic-calibrated."
        )
        docs.append(Document(id=f"metrics_{name}", text=text, source=f"reports/metrics_{name}.json"))
        if "shap_top" in m:
            top = ", ".join(f"{t['feature']} ({t['mean_abs_shap']})" for t in m["shap_top"][:8])
            docs.append(
                Document(
                    id=f"shap_{name}",
                    text=f"Model '{name}' top SHAP feature importances (mean |SHAP|): {top}.",
                    source=f"reports/metrics_{name}.json",
                )
            )
    return docs


def build_corpus() -> list[Document]:
    """All knowledge documents to index, deduplicated by id."""
    docs: list[Document] = []
    docs += _chunk_markdown(DOCS / "PRODUCT_OVERVIEW.md", "docs/PRODUCT_OVERVIEW.md")
    docs += _chunk_markdown(DOCS / "data_dictionary.md", "docs/data_dictionary.md")
    docs += _chunk_markdown(DOCS / "MODEL_CARD.md", "docs/MODEL_CARD.md")
    docs += _stats_documents()
    seen: set[str] = set()
    unique: list[Document] = []
    for d in docs:
        if d.id not in seen and d.text.strip():
            seen.add(d.id)
            unique.append(d)
    return unique
