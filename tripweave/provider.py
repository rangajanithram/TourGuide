"""
Data Provider Layer for TripWeave Optimization Engine.
Abstracts data storage (JSON files, Postgres, Google Places API, etc.) behind a clean interface.
"""
import os
import json
from typing import List, Protocol, Dict
from tripweave.models import Place
from tripweave.config import settings

class PlacesDataProvider(Protocol):
    """Protocol interface defining operations for retrieving places data."""
    def get_places(self, destination: str) -> List[Place]:
        """Fetch all candidate attractions, dining, and accommodations for a city."""
        ...

    def get_supported_cities(self) -> List[str]:
        """Return list of supported destination keys."""
        ...

class JsonFilePlacesProvider:
    """
    File-based implementation of PlacesDataProvider.
    Reads curated seed datasets from disk with in-memory caching.
    """
    def __init__(self, data_dir: str = None):
        if data_dir:
            self.data_dir = data_dir
        else:
            base_project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.data_dir = os.path.join(base_project_dir, settings.data_dir)
            
        self._cache: Dict[str, List[Place]] = {}

    def get_supported_cities(self) -> List[str]:
        return list(settings.supported_cities)

    def get_places(self, destination: str) -> List[Place]:
        city_key = destination.strip().lower()
        if city_key not in settings.supported_cities:
            raise ValueError(
                f"Destination '{destination}' is not supported. Supported cities: {', '.join(c.capitalize() for c in settings.supported_cities)}."
            )

        if city_key in self._cache:
            # Return fresh copies so mutations in one request don't affect cached models
            return [p.model_copy(deep=True) for p in self._cache[city_key]]

        file_name = f"{city_key}_mock.json"
        data_path = os.path.join(self.data_dir, file_name)

        if not os.path.exists(data_path):
            raise FileNotFoundError(f"Database seed file '{file_name}' not found in '{self.data_dir}'.")

        with open(data_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        places = [Place(**item) for item in raw_data]
        self._cache[city_key] = places
        return [p.model_copy(deep=True) for p in places]

# Global singleton provider instance
_provider_instance = None

def get_places_provider() -> PlacesDataProvider:
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = JsonFilePlacesProvider()
    return _provider_instance
