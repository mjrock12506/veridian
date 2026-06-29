"""Single, provider-agnostic LLM interface built on LiteLLM.

Every model call in the AI layer goes through :func:`chat`. Swapping providers
is a configuration change (``LLM_MODEL``), not a code change, because LiteLLM
normalises the OpenAI-style ``messages`` / ``tools`` contract across providers.

The wrapper adds bounded exponential backoff on rate limits so the copilot
degrades gracefully on a free tier rather than crashing.
"""

from __future__ import annotations

import re
import time

import litellm

from ai import config

# Silently drop provider-unsupported params (e.g. a param Gemini ignores)
# rather than erroring, so the same call works across providers.
litellm.drop_params = True
litellm.suppress_debug_info = True

# Substrings that mark a non-retryable error (a free tier with no quota or a
# depleted balance) — retrying these only wastes time, so we fail fast.
_TERMINAL_MARKERS = ("limit: 0", "credits are depleted", "billing")


class LLMUnavailable(RuntimeError):
    """Raised when the LLM cannot be reached (no key, exhausted retries)."""


def _retry_delay_seconds(err: Exception, default: float) -> float:
    """Parse a provider-suggested retry delay from an error, if present.

    Different providers phrase this differently ("retry in 5s", "try again in
    7.5s", "retryDelay: 33s"), so match the common forms and honour the hint up
    to a sane ceiling rather than guessing.
    """
    m = re.search(
        r"(?:retry in|try again in|retry after|retrydelay\"?:?\s*\"?)\s*(\d+(?:\.\d+)?)\s*s",
        str(err),
        re.IGNORECASE,
    )
    if m:
        # Cap the honoured delay so an interactive caller fails over to the next
        # provider quickly instead of waiting out a long rate-limit window.
        return min(float(m.group(1)) + 0.5, 6.0)
    return default


def _chat_once(model, messages, tools, temperature, max_tokens, max_retries, timeout):
    """Call a single model, with bounded retry/backoff on transient errors."""
    retries = max_retries or config.LLM_MAX_RETRIES
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": config.LLM_TEMPERATURE if temperature is None else temperature,
        "max_tokens": max_tokens or config.LLM_MAX_TOKENS,
    }
    if timeout:
        kwargs["timeout"] = timeout
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            return litellm.completion(**kwargs)
        except (litellm.RateLimitError, litellm.ServiceUnavailableError) as err:
            last_err = err
            if any(marker in str(err).lower() for marker in _TERMINAL_MARKERS):
                raise LLMUnavailable(f"quota/credit exhausted for {model}") from err
            if attempt == retries - 1:
                break
            time.sleep(_retry_delay_seconds(err, default=2.0 * (attempt + 1)))
        except litellm.AuthenticationError as err:
            raise LLMUnavailable(f"authentication failed for {model}: {err}") from err
        except litellm.BadRequestError as err:
            # e.g. a provider that strictly validates tool-call arguments and
            # rejects a malformed generation. Surface gracefully rather than crash.
            raise LLMUnavailable(f"request rejected by {model}: {err}") from err

    raise LLMUnavailable(f"{model} unavailable after {retries} attempts: {last_err}")


def chat(
    messages: list[dict],
    tools: list[dict] | None = None,
    *,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    max_retries: int | None = None,
    timeout: float | None = None,
):
    """Call the LLM, falling back across providers when one is rate-limited/down.

    Tries the primary model (``model`` or ``LLM_MODEL``) then ``LLM_FALLBACKS``,
    skipping any whose provider key isn't set — so a single key still helps (a
    higher-throughput model on the same provider absorbs free-tier bursts). Each
    model gets its own retry/backoff. ``max_retries`` makes each attempt fail
    fast for latency-sensitive callers. Raises ``LLMUnavailable`` only when every
    candidate is exhausted.
    """
    chain: list[str] = []
    for m in [model or config.LLM_MODEL, *config.LLM_FALLBACKS]:
        if m and m not in chain and config.provider_key_present(m):
            chain.append(m)
    if not chain:
        raise LLMUnavailable(
            f"No API key found for any configured LLM provider (LLM_MODEL={config.LLM_MODEL!r}). "
            "Set GROQ_API_KEY and/or GEMINI_API_KEY in the environment."
        )

    last_err: Exception | None = None
    for m in chain:
        try:
            return _chat_once(m, messages, tools, temperature, max_tokens, max_retries, timeout)
        except LLMUnavailable as exc:
            last_err = exc  # rate-limited / down — try the next provider in the chain
    raise LLMUnavailable(f"all LLM providers exhausted ({', '.join(chain)}): {last_err}")
