"""Configuration for the Phase 5 AI copilot.

All runtime knobs are read from the environment (optionally via a local
``.env``), so switching LLM providers is a one-line change and no secret is
hardcoded. LiteLLM is the single LLM interface: a model is named with a
``provider/model`` string (e.g. ``gemini/gemini-2.5-flash``,
``groq/llama-3.3-70b-versatile``, ``anthropic/claude-haiku-4-5``,
``ollama/llama3``), and LiteLLM reads each provider's key from its own
conventional environment variable (``GEMINI_API_KEY`` for Gemini).
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional
    pass

# Repo root = parent of the `ai/` package directory.
ROOT = Path(__file__).resolve().parent.parent

# --- LLM (provider-agnostic via LiteLLM) ----------------------------------- #
# Default to a Gemini free-tier model. The brief's example (gemini-2.0-flash)
# was not enabled for free use on the test key (quota limit 0), so the default
# is gemini-2.5-flash, which is. Override with LLM_MODEL for Groq / Claude /
# local Ollama without touching code.
LLM_MODEL = os.environ.get("LLM_MODEL", "gemini/gemini-2.5-flash")
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0.0"))
# Modest cap keeps responses (and free-tier token usage) small.
LLM_MAX_TOKENS = int(os.environ.get("LLM_MAX_TOKENS", "700"))
LLM_MAX_RETRIES = int(os.environ.get("LLM_MAX_RETRIES", "3"))
# Cap on tool-call rounds before the copilot must answer (loop guard).
LLM_MAX_TOOL_ROUNDS = int(os.environ.get("LLM_MAX_TOOL_ROUNDS", "3"))

# --- Retrieval (RAG) -------------------------------------------------------- #
# The knowledge corpus is tiny (dataset dictionary + measured metrics, ~20 KB)
# and committed at KNOWLEDGE_CORPUS_PATH (regenerate with
# `python -m ai.index_knowledge`).
#
# RAG_BACKEND selects how a question is grounded against that corpus:
#   "direct" (default, deployed) — no retrieval model at all. The whole small
#       corpus is loaded straight into the LLM prompt as context. Zero vector
#       DB, zero local embedding model, zero embedding API at request time:
#       peak memory is a few hundred KB, so it fits Render's 512 MB free tier
#       and works regardless of the LLM provider.
#   "tfidf" — rank the corpus with an in-process scikit-learn TF-IDF index
#       (still no vector DB / embedding model; useful once the corpus grows
#       past what fits comfortably in a single prompt).
#   "chroma" — scalable path: Chroma vector store + a local sentence-transformers
#       embedding model. NOT installed by default (needs `chromadb` and
#       `sentence-transformers`, which pull in torch and blow the 512 MB tier);
#       enable only on a larger instance. Kept in the codebase as the
#       grow-into option.
KNOWLEDGE_CORPUS_PATH = Path(
    os.environ.get("KNOWLEDGE_CORPUS_PATH", str(ROOT / "ai" / "knowledge_corpus.json"))
)
RAG_BACKEND = os.environ.get("RAG_BACKEND", "direct").strip().lower()
RAG_TOP_K = int(os.environ.get("RAG_TOP_K", "4"))
# Safety cap for the "direct" backend so an unexpectedly large corpus can't blow
# up prompt size / token usage. The committed corpus (~18 KB) is well under this.
RAG_DIRECT_CHAR_BUDGET = int(os.environ.get("RAG_DIRECT_CHAR_BUDGET", "24000"))
# Local embedding model for the optional "chroma" backend only.
RAG_EMBED_MODEL = os.environ.get("RAG_EMBED_MODEL", "all-MiniLM-L6-v2")


def provider_key_present() -> bool:
    """True if a credential for the configured provider looks available.

    Used to fail fast with a clear message instead of a deep LiteLLM error.
    Local providers (Ollama) need no key.
    """
    provider = LLM_MODEL.split("/", 1)[0].lower()
    key_env = {
        "gemini": "GEMINI_API_KEY",
        "groq": "GROQ_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
    }.get(provider)
    if key_env is None:  # e.g. ollama / unknown -> assume no key needed
        return True
    return bool(os.environ.get(key_env))
