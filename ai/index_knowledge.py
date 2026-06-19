"""Build the copilot's retrieval index.

    python -m ai.index_knowledge

Reads the knowledge corpus (data dictionary, model card, metric summaries) and
(re)builds the local Chroma vector store under ai/.chroma. Idempotent.
"""

from __future__ import annotations

from ai import rag


def main() -> int:
    n = rag.build_index()
    print(f"[rag] indexed {n} documents into '{rag.config.CHROMA_COLLECTION}' "
          f"at {rag.config.CHROMA_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
