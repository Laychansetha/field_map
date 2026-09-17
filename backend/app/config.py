import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseModel):
    APP_NAME: str = "Ibis Rice Inspection & Spatial Intelligence Platform"
    APP_VERSION: str = "2.0.0"
    API_PREFIX: str = "/api/v1"
    
    # Database: Defaults to local SQLite if PostgreSQL is not specified
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{DATA_DIR / 'ibis_platform.db'}"
    )
    
    # Active inspection season
    DEFAULT_SEASON: str = os.getenv("DEFAULT_SEASON", "2026")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "ibis-rice-conservation-secret-key-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # CORS
    ALLOWED_ORIGINS: list = ["*"]

settings = Settings()
