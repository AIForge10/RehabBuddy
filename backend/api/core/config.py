from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "RehabBuddy API"
    API_V1_STR: str = "/api/v1"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.6-flash"
    # Thinking for the spoken pain-check reply. "minimal" is fastest; models
    # without it (gemini-2.5-flash, gemini-3.7-flash, ...) need "low".
    GEMINI_THINKING_LEVEL: str = "minimal"

    # Dates the server writes into text ("pain 8/10 on Sep 26") are the clinic's calendar days,
    # not the server's: DigitalOcean runs in UTC, where an evening in Miami is already tomorrow.
    CLINIC_TIMEZONE: str = "America/New_York"

    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID_EN: str = ""
    ELEVENLABS_VOICE_ID_ES: str = ""
    ELEVENLABS_MODEL: str = "eleven_flash_v2_5"  # lowest-latency model
    ELEVENLABS_STT_MODEL: str = "scribe_v2"  # speech-to-text for spoken pain check-ins

    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "rehabbuddy"
    
    SECRET_KEY: str = "secretkey"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    
    BACKEND_CORS_ORIGINS: List[str] = [
        # Production web app (DigitalOcean static site on the Porkbun domain). The API
        # lives on its own ondigitalocean.app host, so these calls are cross-origin.
        "https://bendwith.us",
        "https://www.bendwith.us",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        # The iOS and Android apps (mobile/): their web views load the app from these origins.
        "capacitor://localhost",
        "https://localhost",
    ]
    
    @property
    def async_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    model_config = SettingsConfigDict(
        env_file=(str(ENV_FILE), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )
    
settings = Settings()