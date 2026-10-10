"""
Centralized Configuration for TripWeave Optimization Engine.
Loads environment variables with robust production defaults.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Optional
from pydantic import BaseModel, Field

# Explicit environment values (deployment secrets) always take precedence.
load_dotenv(Path(__file__).resolve().parent.parent / '.env', override=False)

class Settings(BaseModel):
    environment: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "development"))
    api_host: str = Field(default_factory=lambda: os.getenv("API_HOST", "127.0.0.1"))
    api_port: int = Field(default_factory=lambda: int(os.getenv("API_PORT", "8000")))
    solver_concurrency: int = Field(default_factory=lambda: int(os.getenv("SOLVER_CONCURRENCY", "2")), ge=1, le=16, validate_default=True)
    solver_queue_timeout_seconds: float = Field(default_factory=lambda: float(os.getenv("SOLVER_QUEUE_TIMEOUT_SECONDS", "5")), gt=0, le=30, validate_default=True)

    # Allowed CORS Origins - can be comma-separated string in env, e.g. "http://localhost:3000,https://tripweave.com"
    cors_origins: List[str] = Field(default_factory=lambda: [
        origin.strip() for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
        ).split(",") if origin.strip()
    ])

    supported_cities: List[str] = Field(default_factory=lambda: ["hyderabad", "delhi", "jaipur", "bengaluru", "mumbai"])
    data_dir: str = Field(default_factory=lambda: os.getenv("DATA_DIR", "data"))

    # Browser public key is sufficient; never use a service-role key for identity validation.
    supabase_url: Optional[str] = Field(default_factory=lambda: os.getenv("SUPABASE_URL"))
    supabase_publishable_key: Optional[str] = Field(default_factory=lambda: os.getenv("SUPABASE_PUBLISHABLE_KEY"))

settings = Settings()
