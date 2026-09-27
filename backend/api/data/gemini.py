"""Small Gemini helper. Every call has a timeout and returns None on any failure,
so callers always fall back to a template (a quota error never breaks the demo)."""
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

log = logging.getLogger("rehabbuddy.gemini")

try:  # use the project settings if available
    from api.core.config import settings as _settings
    _KEY = getattr(_settings, "GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    _MODEL = getattr(_settings, "GEMINI_MODEL", "") or os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
except Exception:  # noqa: BLE001
    _KEY = os.getenv("GEMINI_API_KEY", "")
    _MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

_client = None
# Gemini refuses a request deadline under 10 s, so the time limit is kept here instead: the call
# runs on this pool and is abandoned (left to finish on its own) when it runs past its budget.
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="gemini")
_FALLBACK = "gemini-3.5-flash-lite"
# The browser gives up on a request after 10 s (frontend/src/api/client.ts); both models together
# stay under that, and a slow first model leaves the fallback time to answer.
_BUDGET_S = 8.0
_PRIMARY_S = 5.0


def generate(prompt: str, system: str = "", max_tokens: int = 300) -> str | None:
    """Gemini's text for `prompt`, or None. `max_tokens` is the answer's length; thinking gets its
    own headroom on top, since it counts toward the same limit and a cut-off note is worse than none."""
    global _client
    if not _KEY:
        return None
    try:
        from google import genai
        from google.genai import types
        if _client is None:
            _client = genai.Client(api_key=_KEY, http_options=types.HttpOptions(timeout=15000))
        try:
            level = _settings.GEMINI_THINKING_LEVEL.upper()
        except Exception:  # noqa: BLE001
            level = "MINIMAL"
        models_to_try = [_MODEL]
        if _MODEL != _FALLBACK:
            models_to_try.append(_FALLBACK)

        deadline = time.monotonic() + _BUDGET_S
        for i, m in enumerate(models_to_try):
            left = deadline - time.monotonic()
            if left <= 0.5:
                break
            budget = min(left, _PRIMARY_S) if i < len(models_to_try) - 1 else left
            cfg = types.GenerateContentConfig(
                system_instruction=system or None,
                max_output_tokens=max_tokens + 1024,
                temperature=0.4,
                thinking_config=types.ThinkingConfig(thinking_level=level),
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            )
            try:
                resp = _pool.submit(_client.models.generate_content, model=m, contents=prompt,
                                    config=cfg).result(timeout=budget)
                if resp.candidates and resp.candidates[0].finish_reason == types.FinishReason.MAX_TOKENS:
                    log.warning("Gemini model %s ran out of tokens; not using a cut-off answer", m)
                    continue
                text = (resp.text or "").strip()
                if text:
                    return text
            except FutureTimeout:
                log.warning("Gemini model %s took over %.1f s, moving on", m, budget)
            except Exception as ex:
                log.warning("Gemini model %s failed: %s", m, ex)
        return None
    except Exception as e:  # noqa: BLE001
        log.warning("Gemini call failed, using fallback: %s", e)
        return None
