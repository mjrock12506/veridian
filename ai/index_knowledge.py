"""Build the copilot's retrieval corpus.

    python -m ai.index_knowledge

Reads the knowledge corpus (data dictionary, model card, metric summaries) and
writes the precomputed snapshot to ai/knowledge_corpus.json, which the API ships
in its Docker image and searches with a lightweight TF-IDF retriever at request
time (no vector DB / embedding model needed). Idempotent — commit the result.
"""

from __future__ import annotations

from ai import rag


def main() -> int:
    n = rag.build_index()
    print(f"[rag] wrote {n} documents to {rag.config.KNOWLEDGE_CORPUS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
