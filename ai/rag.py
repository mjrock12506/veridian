"""Retrieval layer (RAG) — pluggable backends, lightweight by default.

Grounding passages come from a small knowledge corpus (see :mod:`ai.knowledge`)
that is precomputed offline and committed at ``ai/knowledge_corpus.json``
(regenerate with ``python -m ai.index_knowledge``).

The backend is chosen with ``RAG_BACKEND`` (see :mod:`ai.config`):

* ``"direct"`` (default, deployed) — **no retrieval model at request time.** The
  whole (tiny) corpus is returned and loaded straight into the LLM prompt as
  context. No vector database, no local embedding model, no embedding API: peak
  memory is a few hundred KB, so ``/ask`` fits Render's 512 MB free tier and
  works regardless of which provider the LLM key is for.
* ``"tfidf"`` — rank the corpus with an in-process scikit-learn TF-IDF index
  (still no vector DB / embedding model). Useful once the corpus grows past what
  fits comfortably in a single prompt.
* ``"chroma"`` — scalable path: a Chroma vector store backed by a local
  sentence-transformers embedding model. Heavy (pulls in torch); not installed
  by default. Kept in the codebase as the grow-into option, lazily imported so
  it costs nothing unless selected.

If the selected backend errors (e.g. ``chroma`` chosen but its deps are absent),
retrieval falls back to ``direct`` so ``/ask`` stays answerable.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from ai import config, knowledge

logger = logging.getLogger("veridian.rag")

# Cached TF-IDF index (vectorizer, doc_matrix, docs) — built on first use.
_tfidf_index: tuple | None = None
# Cached Chroma collection — built on first use.
_chroma_collection = None


@dataclass
class Passage:
    text: str
    source: str
    score: float


def _load_corpus() -> list[dict]:
    """Corpus documents to ground against.

    Prefers the committed snapshot (which ships inside the Docker image); falls
    back to building it from the source docs/reports when they're available
    (local development / regeneration).
    """
    path = config.KNOWLEDGE_CORPUS_PATH
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            logger.exception("failed to read committed corpus at %s; rebuilding", path)
    return [{"id": d.id, "text": d.text, "source": d.source} for d in knowledge.build_corpus()]


# --------------------------------------------------------------------------- #
# Backend: direct (default) — whole corpus into the prompt, no retrieval model
# --------------------------------------------------------------------------- #
def _retrieve_direct(query: str, k: int | None = None) -> list[Passage]:
    """Return the entire (small) corpus, bounded by a char budget.

    There is no scoring step: the LLM does the "retrieval" by reading the full
    context. ``k`` is ignored on purpose. This is the lightweight deployed path.
    """
    budget = config.RAG_DIRECT_CHAR_BUDGET
    out: list[Passage] = []
    used = 0
    for d in _load_corpus():
        text = d.get("text", "")
        if not text:
            continue
        used += len(text)
        if out and used > budget:
            logger.warning("direct RAG corpus exceeded %d chars; truncating context", budget)
            break
        out.append(Passage(text=text, source=d.get("source", "?"), score=1.0))
    return out


# --------------------------------------------------------------------------- #
# Backend: tfidf — in-process scikit-learn ranking (no vector DB / embeddings)
# --------------------------------------------------------------------------- #
def _get_tfidf_index():
    global _tfidf_index
    if _tfidf_index is None:
        from sklearn.feature_extraction.text import TfidfVectorizer

        docs = _load_corpus()
        if not docs:
            _tfidf_index = (None, None, [])
            return _tfidf_index
        vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
        matrix = vec.fit_transform([d["text"] for d in docs])
        _tfidf_index = (vec, matrix, docs)
    return _tfidf_index


def _retrieve_tfidf(query: str, k: int | None = None) -> list[Passage]:
    k = k or config.RAG_TOP_K
    import numpy as np
    from sklearn.metrics.pairwise import linear_kernel

    vec, matrix, docs = _get_tfidf_index()
    if not docs or vec is None:
        return []
    # TF-IDF rows are L2-normalised, so the linear kernel is cosine similarity.
    sims = linear_kernel(vec.transform([query]), matrix)[0]
    out: list[Passage] = []
    for i in np.argsort(sims)[::-1][:k]:
        score = float(sims[i])
        if score <= 0:
            continue
        d = docs[int(i)]
        out.append(Passage(text=d["text"], source=d.get("source", "?"), score=round(score, 4)))
    return out


# --------------------------------------------------------------------------- #
# Backend: chroma — Chroma vector store + local embedding model (scalable, heavy)
# --------------------------------------------------------------------------- #
def _get_chroma_collection():
    """Build (once) an in-memory Chroma collection from the committed corpus.

    Lazily imports ``chromadb`` and a sentence-transformers embedding model, so
    nothing is loaded unless ``RAG_BACKEND=chroma`` is explicitly selected. These
    deps pull in torch and exceed the 512 MB free tier — install them only on a
    larger instance (``pip install chromadb sentence-transformers``).
    """
    global _chroma_collection
    if _chroma_collection is None:
        import chromadb
        from chromadb.utils import embedding_functions

        docs = _load_corpus()
        client = chromadb.Client()  # ephemeral, in-memory
        ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=config.RAG_EMBED_MODEL
        )
        coll = client.create_collection(name="veridian_knowledge", embedding_function=ef)
        coll.add(
            ids=[d["id"] for d in docs],
            documents=[d["text"] for d in docs],
            metadatas=[{"source": d.get("source", "?")} for d in docs],
        )
        _chroma_collection = coll
    return _chroma_collection


def _retrieve_chroma(query: str, k: int | None = None) -> list[Passage]:
    k = k or config.RAG_TOP_K
    coll = _get_chroma_collection()
    res = coll.query(query_texts=[query], n_results=k)
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[None] * len(docs)])[0]
    out: list[Passage] = []
    for text, meta, dist in zip(docs, metas, dists):
        # Chroma returns a distance; convert to a similarity-ish score.
        score = 1.0 if dist is None else round(1.0 / (1.0 + float(dist)), 4)
        out.append(Passage(text=text, source=(meta or {}).get("source", "?"), score=score))
    return out


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
_BACKENDS = {
    "direct": _retrieve_direct,
    "tfidf": _retrieve_tfidf,
    "chroma": _retrieve_chroma,
}


def is_indexed() -> bool:
    """True if any grounding passages are available for the active backend."""
    try:
        return bool(_load_corpus())
    except Exception:
        return False


def retrieve(query: str, k: int | None = None) -> list[Passage]:
    """Return grounded passages for a query (empty list if none available).

    Dispatches on ``RAG_BACKEND``; on any backend error, falls back to the
    lightweight ``direct`` corpus so ``/ask`` stays answerable.
    """
    if not (query or "").strip():
        return []
    backend = config.RAG_BACKEND if config.RAG_BACKEND in _BACKENDS else "direct"
    try:
        return _BACKENDS[backend](query, k)
    except Exception:
        logger.exception("RAG backend %r failed; falling back to direct corpus", backend)
        if backend != "direct":
            try:
                return _retrieve_direct(query, k)
            except Exception:
                logger.exception("direct RAG fallback also failed")
        return []


def build_index() -> int:
    """Regenerate the committed corpus snapshot from the source docs/reports.

    Offline/build-time use (``python -m ai.index_knowledge``); returns doc count.
    Retrieval at request time only reads the committed JSON, never this path.
    """
    global _tfidf_index, _chroma_collection
    docs = knowledge.build_corpus()
    payload = [{"id": d.id, "text": d.text, "source": d.source} for d in docs]
    config.KNOWLEDGE_CORPUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.KNOWLEDGE_CORPUS_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False)
    )
    _tfidf_index = None  # force rebuild on next retrieve()
    _chroma_collection = None
    return len(docs)
