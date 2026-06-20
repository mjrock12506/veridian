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

# --- Retrieval (lightweight TF-IDF over a committed corpus) ----------------- #
# The knowledge corpus is precomputed offline and committed (regenerate with
# `python -m ai.index_knowledge`), so retrieval needs no vector DB, no local
# embedding model, and no embedding API at request time — it stays well within
# Render's 512 MB free tier and works regardless of the LLM provider.
KNOWLEDGE_CORPUS_PATH = Path(
    os.environ.get("KNOWLEDGE_CORPUS_PATH", str(ROOT / "ai" / "knowledge_corpus.json"))
)
RAG_TOP_K = int(os.environ.get("RAG_TOP_K", "4"))


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
