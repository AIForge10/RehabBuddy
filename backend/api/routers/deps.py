from functools import lru_cache

from api.services.gemini_service import GeminiService


# One client for the app's lifetime, so requests reuse its open connection to
# Gemini instead of paying a fresh TLS handshake each time.
@lru_cache
def get_gemini_service() -> GeminiService:
    return GeminiService()
