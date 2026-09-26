"""Small Gemini helper. Every call has a timeout and returns None on any failure,
so callers always fall back to a template (a quota error never breaks the demo)."""
import logging
import os

log = logging.getLogger("rehabbuddy.gemini")

try:  # use the project settings if available
    from api.core.config import settings as _settings
    _KEY = getattr(_settings, "GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    _MODEL = getattr(_settings, "GEMINI_MODEL", "") or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
except Exception:  # noqa: BLE001
    _KEY = os.getenv("GEMINI_API_KEY", "")
    _MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

_client = None


def generate(prompt: str, system: str = "", max_tokens: int = 300) -> str | None:
    global _client
    if not _KEY:
        return None
    try:
        from google import genai
        from google.genai import types
        if _client is None:
            _client = genai.Client(api_key=_KEY, http_options=types.HttpOptions(timeout=8000))
        resp = _client.models.generate_content(
            model=_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system or None,
                                               max_output_tokens=max_tokens, temperature=0.4),
        )
        text = (resp.text or "").strip()
        return text or None
    except Exception as e:  # noqa: BLE001
        log.warning("Gemini call failed, using fallback: %s", e)
        return None
