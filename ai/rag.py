"""Retrieval layer (RAG) backed by a local Chroma vector store.

The corpus from :mod:`ai.knowledge` is embedded with Chroma's default local
embedding model (no API key, runs offline once the small model is cached) and
persisted under ``ai/.chroma`` (gitignored). The copilot retrieves the top-k
chunks for a question and grounds its answer in them, so dataset figures come
from real artifacts rather than the model's parametric memory.
"""

from __future__ import annotations

from dataclasses import dataclass

from ai import config, knowledge

_client = None
_collection = None


def _embedding_function():
    # Default = a small all-MiniLM ONNX model cached under ~/.cache/chroma.
    from chromadb.utils import embedding_functions

    return embedding_functions.DefaultEmbeddingFunction()


def _get_collection():
    """Return the persistent collection, creating the client lazily."""
    global _client, _collection
    if _collection is None:
        import chromadb

        config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))
        _collection = _client.get_or_create_collection(
            name=config.CHROMA_COLLECTION,
            embedding_function=_embedding_function(),
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def build_index() -> int:
    """(Re)build the vector store from the knowledge corpus. Returns doc count."""
    global _collection
    import chromadb

    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))
    # Start clean so re-indexing is idempotent.
    try:
        client.delete_collection(config.CHROMA_COLLECTION)
    except Exception:
        pass
    _collection = None
    coll = client.get_or_create_collection(
        name=config.CHROMA_COLLECTION,
        embedding_function=_embedding_function(),
        metadata={"hnsw:space": "cosine"},
    )
    docs = knowledge.build_corpus()
    coll.add(
        ids=[d.id for d in docs],
        documents=[d.text for d in docs],
        metadatas=[{"source": d.source} for d in docs],
    )
    _collection = coll
    return len(docs)


def is_indexed() -> bool:
    try:
        return _get_collection().count() > 0
    except Exception:
        return False


@dataclass
class Passage:
    text: str
    source: str
    score: float


def retrieve(query: str, k: int | None = None) -> list[Passage]:
    """Return the top-k grounded passages for a query (empty if unavailable)."""
    k = k or config.RAG_TOP_K
    try:
        coll = _get_collection()
        if coll.count() == 0:
            return []
        res = coll.query(query_texts=[query], n_results=min(k, coll.count()))
    except Exception:
        return []
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    out: list[Passage] = []
    for text, meta, dist in zip(docs, metas, dists):
        out.append(Passage(text=text, source=(meta or {}).get("source", "?"), score=round(1 - dist, 4)))
    return out
