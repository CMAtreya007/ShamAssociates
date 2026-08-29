import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
EXPORT_DIR = BASE_DIR / "exports"

DATA_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 8756
    DEBUG: bool = True
    DATABASE_URL: str = ""
    EXPORT_DIR: str = str(EXPORT_DIR)
    SCHEDULE_CRON_TIMES: str = "16:30,17:00,18:00"
    
    # Optional Third-Party Fallback Keys
    ALPHA_VANTAGE_API_KEY: str = ""
    UPSTOX_API_KEY: str = ""
    FINANCIAL_MODELING_PREP_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_database_url(self) -> str:
        if not self.DATABASE_URL or "sqlite" in self.DATABASE_URL:
            db_file = (DATA_DIR / "nse_market.db").resolve()
            return f"sqlite+aiosqlite:///{db_file.as_posix()}"
        return self.DATABASE_URL

settings = Settings()
settings.DATABASE_URL = settings.get_database_url()
