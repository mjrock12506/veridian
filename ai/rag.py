"""Retrieval layer (RAG) — lightweight and free-tier friendly.

Grounding passages come from a small knowledge corpus (see :mod:`ai.knowledge`)
that is precomputed offline and committed at ``ai/knowledge_corpus.json``
(regenerate with ``python -m ai.index_knowledge``). At request time the query is
scored against that corpus with TF-IDF cosine similarity using scikit-learn,
which is already a serving dependency.

This means ``/ask`` needs **no vector database, no local embedding model, and no
embedding API** at request time: peak memory is a few hundred KB and retrieval
works regardless of which LLM provider the API key is for. (The previous Chroma
store loaded a local ONNX embedding model that pushed the serving image over
Render's 512 MB free tier.)
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from ai import config, knowledge

# Cached (vectorizer, doc_matrix, docs) built on first retrieval.
_index: tuple | None = None


@dataclass
class Passage:
    text: str
    source: str
    score: float


def _load_corpus() -> list[dict]:
    """Corpus documents to search.

    Prefers the committed snapshot (which ships inside the Docker image); falls
    back to building it from the source docs/reports when they're available
    (local development / regeneration).
    """
    path = config.KNOWLEDGE_CORPUS_PATH
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    return [{"id": d.id, "text": d.text, "source": d.source} for d in knowledge.build_corpus()]


def _get_index():
    global _index
    if _index is None:
        from sklearn.feature_extraction.text import TfidfVectorizer

        docs = _load_corpus()
        if not docs:
            _index = (None, None, [])
            return _index
        vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
        matrix = vec.fit_transform([d["text"] for d in docs])
        _index = (vec, matrix, docs)
    return _index


def is_indexed() -> bool:
    try:
        return bool(_get_index()[2])
    except Exception:
        return False


def retrieve(query: str, k: int | None = None) -> list[Passage]:
    """Return the top-k grounded passages for a query (empty if unavailable)."""
    k = k or config.RAG_TOP_K
    if not (query or "").strip():
        return []
    try:
        vec, matrix, docs = _get_index()
        if not docs or vec is None:
            return []
        import numpy as np
        from sklearn.metrics.pairwise import linear_kernel

        # TF-IDF rows are L2-normalised, so the linear kernel is cosine similarity.
        sims = linear_kernel(vec.transform([query]), matrix)[0]
    except Exception:
        return []

    out: list[Passage] = []
    for i in np.argsort(sims)[::-1][:k]:
        score = float(sims[i])
        if score <= 0:
            continue
        d = docs[int(i)]
        out.append(Passage(text=d["text"], source=d.get("source", "?"), score=round(score, 4)))
    return out


def build_index() -> int:
    """Regenerate the committed corpus snapshot from the source docs/reports.

    Offline/build-time use (``python -m ai.index_knowledge``); returns doc count.
    Retrieval at request time only reads the committed JSON, never this path.
    """
    global _index
    docs = knowledge.build_corpus()
    payload = [{"id": d.id, "text": d.text, "source": d.source} for d in docs]
    config.KNOWLEDGE_CORPUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.KNOWLEDGE_CORPUS_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False)
    )
    _index = None  # force rebuild on next retrieve()
    return len(docs)
