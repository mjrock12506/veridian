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
        return min(float(m.group(1)) + 0.5, 60.0)
    return default


def chat(
    messages: list[dict],
    tools: list[dict] | None = None,
    *,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    max_retries: int | None = None,
):
    """Call the configured LLM and return the raw LiteLLM response.

    Retries on transient rate-limit / availability errors with exponential
    backoff, honouring a provider-suggested delay when one is given. Pass
    ``max_retries`` to fail fast (e.g. 1) for latency-sensitive, best-effort
    callers that prefer a quick fallback over waiting out a backoff.
    """
    retries = max_retries or config.LLM_MAX_RETRIES
    if not config.provider_key_present():
        raise LLMUnavailable(
            f"No API key found for provider in LLM_MODEL={config.LLM_MODEL!r}. "
            "Set the provider's key in .env (e.g. GEMINI_API_KEY)."
        )

    kwargs: dict = {
        "model": model or config.LLM_MODEL,
        "messages": messages,
        "temperature": config.LLM_TEMPERATURE if temperature is None else temperature,
        "max_tokens": max_tokens or config.LLM_MAX_TOKENS,
    }
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
                raise LLMUnavailable(
                    "LLM quota/credit exhausted for the configured provider "
                    f"({config.LLM_MODEL}). Set LLM_MODEL to another provider or "
                    "add credits."
                ) from err
            if attempt == retries - 1:
                break
            time.sleep(_retry_delay_seconds(err, default=2.0 * (attempt + 1)))
        except litellm.AuthenticationError as err:
            raise LLMUnavailable(f"Authentication failed: {err}") from err
        except litellm.BadRequestError as err:
            # e.g. a provider that strictly validates tool-call arguments and
            # rejects a malformed generation. Surface gracefully rather than
            # crashing the request.
            raise LLMUnavailable(f"Request rejected by provider: {err}") from err

    raise LLMUnavailable(
        f"LLM unavailable after {retries} attempts: {last_err}"
    )
