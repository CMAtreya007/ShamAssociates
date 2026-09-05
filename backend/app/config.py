import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
EXPORT_DIR = BASE_DIR / "exports"

DATA_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8756"))
    DEBUG: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")
    DATABASE_URL: str = ""
    EXPORT_DIR: str = str(EXPORT_DIR)
    SCHEDULE_CRON_TIMES: str = "16:30,17:00,18:00"
    
    # Authentication Settings
    JWT_SECRET: str = os.getenv("JWT_SECRET", "nse_secure_session_secret_key_2025_production")
    JWT_EXPIRY_HOURS: int = 72  # 3 days active session

    # Default Test User Credentials (customizable via .env / environment)
    USER_ADMIN_NAME: str = "admin"
    USER_ADMIN_PASS: str = os.getenv("AUTH_USER_ADMIN_PASS", "Admin@NSE2025!")
    
    USER_ANALYST_NAME: str = "client_analyst"
    USER_ANALYST_PASS: str = os.getenv("AUTH_USER_ANALYST_PASS", "Analyst@NSE2025!")
    
    USER_TESTER_NAME: str = "client_tester"
    USER_TESTER_PASS: str = os.getenv("AUTH_USER_TESTER_PASS", "Tester@NSE2025!")

    # Frontend Dist Path for unified hosting
    FRONTEND_DIST: Path = BASE_DIR.parent / "frontend" / "dist"

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
