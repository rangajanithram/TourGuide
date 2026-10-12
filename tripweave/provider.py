"""
Data Provider Layer for TripWeave Optimization Engine.
Abstracts data storage (JSON files, Postgres, Google Places API, etc.) behind a clean interface.
"""
import os
import json
import time
import threading
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlparse
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

class DatabaseCatalogUnavailable(OSError):
    """A database failure must never silently become stale seed data."""


class SupabasePlacesProvider:
    """Read-only public catalog; Hyderabad moves first, other cities retain seeds."""
    def __init__(self, url, key, seed=None, opener=urlopen, clock=time.monotonic):
        parsed = urlparse(url or "")
        if not key or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise DatabaseCatalogUnavailable("Supabase catalog configuration is invalid")
        self.url, self.key = url.rstrip("/"), key
        self.seed = seed or JsonFilePlacesProvider()
        self.opener, self.clock = opener, clock
        self._cached = None
        self._lock = threading.Lock()

    def get_supported_cities(self):
        return self.seed.get_supported_cities()

    def get_places(self, destination):
        city = destination.strip().lower()
        if city != "hyderabad":
            return self.seed.get_places(city)
        with self._lock:
            now = self.clock()
            if self._cached and now < self._cached[0]:
                return [p.model_copy(deep=True) for p in self._cached[1]]
            query = urlencode({"city": "eq.hyderabad", "published": "eq.true", "select": "place_id,payload,source_urls,reviewed_at", "order": "place_id.asc", "limit": "501"})
            request = Request(f"{self.url}/rest/v1/places?{query}", headers={"apikey": self.key})
            try:
                with self.opener(request, timeout=8) as response:
                    raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise ValueError("Catalog exceeds response limit")
                rows = json.loads(raw)
                if not isinstance(rows, list) or not rows or len(rows) > 500:
                    raise ValueError("Catalog empty or exceeds supported size")
                places = []
                for row in rows:
                    payload = dict(row["payload"])
                    if payload.get("place_id") != row["place_id"]:
                        raise ValueError("Catalog identity mismatch")
                    payload.update(catalog_origin="supabase_curated", source_urls=row["source_urls"], last_verified_date=row["reviewed_at"])
                    places.append(Place.model_validate(payload))
                ids = [p.place_id for p in places]
                if len(ids) != len(set(ids)) or not any(p.place_type == "hotel" for p in places) or not any(p.place_type == "attraction" for p in places):
                    raise ValueError("Incomplete destination catalog")
            except Exception as error:
                # Do not include URLs, credentials, response bodies or provider errors.
                raise DatabaseCatalogUnavailable("Destination catalog is temporarily unavailable") from error
            self._cached = (self.clock() + 60, places)
            return [p.model_copy(deep=True) for p in places]


# Global singleton provider instance
_provider_instance = None

def get_places_provider() -> PlacesDataProvider:
    global _provider_instance
    if _provider_instance is None:
        if settings.place_catalog_provider == "supabase":
            _provider_instance = SupabasePlacesProvider(settings.supabase_url, settings.supabase_publishable_key)
        elif settings.place_catalog_provider == "json":
            _provider_instance = JsonFilePlacesProvider()
        else:
            raise DatabaseCatalogUnavailable("Unknown PLACE_CATALOG_PROVIDER")
    return _provider_instance
