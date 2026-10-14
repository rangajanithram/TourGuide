"""Bounded, on-demand OSM place discovery through Geoapify's free plan.

Discovery records are not optimizer Place objects: missing feasibility facts
must be resolved before a discovered stop can enter a verified saved plan.
"""
import json
import threading
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import urlopen
from fastapi import HTTPException

CATEGORIES = {
    "all": "tourism,catering.restaurant,leisure.park,natural.mountain",
    "attractions": "tourism.sights",
    "restaurants": "catering.restaurant",
    "stays": "accommodation",
    "parks": "leisure.park",
    "hills": "natural.mountain",
}


class DiscoveryProvider:
    def __init__(self, key, daily_limit=100, opener=urlopen):
        self.key = key
        self.daily_limit = daily_limit
        self.opener = opener
        self.lock = threading.Lock()
        self.day = None
        self.requests = 0

    def _get(self, path, params):
        if not self.key:
            raise HTTPException(503, "Real-place discovery is not configured yet.")
        # Process-local backstop; set provider-side quotas for all workers.
        with self.lock:
            today = datetime.now(timezone.utc).date()
            if today != self.day:
                self.day, self.requests = today, 0
            if self.requests >= self.daily_limit:
                raise HTTPException(429, "Discovery's daily request allowance is reached.")
            self.requests += 1
        try:
            url = "https://api.geoapify.com/" + path + "?" + urlencode({**params, "apiKey": self.key})
            with self.opener(url, timeout=8) as response:
                body = response.read(1_048_577)
            if len(body) > 1_048_576:
                raise ValueError("Response too large")
            result = json.loads(body)
            if not isinstance(result.get("features"), list):
                raise ValueError("Invalid feature collection")
            return result["features"]
        except Exception:
            # Never return a URL or raw exception containing the API key.
            raise HTTPException(503, "Place-data service is unavailable. Please retry later.") from None

    def search(self, location, category, query=None):
        locations = self._get("v1/geocode/search", {"text": location, "limit": 1, "lang": "en"})
        if not locations:
            return {"location": location, "places": [], "fetched_at": datetime.now(timezone.utc).isoformat()}
        try:
            center = locations[0]["properties"]
            lat, lon = float(center["lat"]), float(center["lon"])
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise HTTPException(503, "Location service returned invalid coordinates.") from None
        params = {"categories": CATEGORIES[category],
            "filter": f"circle:{lon},{lat},15000", "bias": f"proximity:{lon},{lat}", "limit": 20, "lang": "en"}
        if query:
            params["name"] = query
        features = self._get("v2/places", params)
        places = []
        for feature in features[:20]:
            if not isinstance(feature, dict):
                continue
            props = feature.get("properties", {})
            if not isinstance(props, dict):
                continue
            name = props.get("name")
            if not isinstance(name, str) or not name.strip() or not props.get("place_id"):
                continue
            try:
                lat, lng = float(props["lat"]), float(props["lon"])
                if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                    continue
            except (KeyError, TypeError, ValueError):
                continue
            categories = props.get("categories", [])
            is_food = isinstance(categories, list) and any(isinstance(c, str) and c.startswith("catering.restaurant") for c in categories)
            places.append({"lat": lat, "lng": lng,"id": str(props.get("place_id", ""))[:512], "name": name[:250],
                "address": str(props.get("formatted", ""))[:600], "category": "restaurants" if is_food else category})
        return {"location": str(center.get("formatted", location))[:600], "places": places,
            "fetched_at": datetime.now(timezone.utc).isoformat()}
