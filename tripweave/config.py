"""
Centralized Configuration for TripWeave Optimization Engine.
Loads environment variables with robust production defaults.
"""
import os
from typing import List
from pydantic import BaseModel, Field

class Settings(BaseModel):
    environment: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "development"))
    api_host: str = Field(default_factory=lambda: os.getenv("API_HOST", "127.0.0.1"))
    api_port: int = Field(default_factory=lambda: int(os.getenv("API_PORT", "8000")))
    
    # Allowed CORS Origins - can be comma-separated string in env, e.g. "http://localhost:3000,https://tripweave.com"
    cors_origins: List[str] = Field(default_factory=lambda: [
        origin.strip() for origin in os.getenv(
            "CORS_ORIGINS", 
            "http://localhost:3000,http://127.0.0.1:3000"
        ).split(",") if origin.strip()
    ])
    
    supported_cities: List[str] = Field(default_factory=lambda: ["hyderabad", "delhi", "jaipur", "bengaluru", "mumbai"])
    data_dir: str = Field(default_factory=lambda: os.getenv("DATA_DIR", "data"))

settings = Settings()
