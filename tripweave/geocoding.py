"""
Geocoding & Location Resolution for TripWeave Optimization Engine.
Resolves trip origins (airports, railway stations, bus stands, and city hubs)
to accurate GPS coordinates without relying on external network dependencies.
"""
from typing import Tuple, Dict, Any, Optional

CITY_HUBS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "hyderabad": {
        "airport": {
            "name": "Rajiv Gandhi International Airport (HYD)",
            "lat": 17.2403,
            "lng": 78.4294,
            "aliases": ["airport", "hyd airport", "shamshabad", "rgia", "flight"]
        },
        "station": {
            "name": "Secunderabad Railway Station",
            "lat": 17.4334,
            "lng": 78.5045,
            "aliases": ["secunderabad", "railway station", "station", "train", "sc junction"]
        },
        "station_nampally": {
            "name": "Hyderabad Deccan Railway Station (Nampally)",
            "lat": 17.3916,
            "lng": 78.4674,
            "aliases": ["nampally", "hyderabad deccan", "hyderabad station"]
        },
        "station_kacheguda": {
            "name": "Kacheguda Railway Station",
            "lat": 17.3879,
            "lng": 78.5029,
            "aliases": ["kacheguda", "kachiguda"]
        },
        "bus": {
            "name": "Mahatma Gandhi Bus Station (MGBS)",
            "lat": 17.3789,
            "lng": 78.4828,
            "aliases": ["mgbs", "bus stand", "imlibun", "bus station"]
        },
        "tech_hub": {
            "name": "HITEC City / Cyber Towers",
            "lat": 17.4504,
            "lng": 78.3808,
            "aliases": ["hitec", "cyber towers", "madhapur", "gachibowli"]
        },
        "center": {
            "name": "Abids / MG Road Central Hub",
            "lat": 17.3895,
            "lng": 78.4770,
            "aliases": ["abids", "center", "city center", "mg road", "koti", "central hub", "hotel"]
        }
    },
    "delhi": {
        "airport": {
            "name": "Indira Gandhi International Airport (DEL T3)",
            "lat": 28.5562,
            "lng": 77.1000,
            "aliases": ["airport", "igi", "delhi airport", "terminal 3", "t3", "flight"]
        },
        "station": {
            "name": "New Delhi Railway Station (NDLS)",
            "lat": 28.6429,
            "lng": 77.2195,
            "aliases": ["new delhi railway station", "station", "ndls", "paharganj", "train"]
        },
        "station_old_delhi": {
            "name": "Old Delhi Railway Station (DLI)",
            "lat": 28.6619,
            "lng": 77.2307,
            "aliases": ["old delhi", "dli", "chandni chowk station"]
        },
        "station_nizamuddin": {
            "name": "Hazrat Nizamuddin Railway Station (NZM)",
            "lat": 28.5892,
            "lng": 77.2526,
            "aliases": ["nizamuddin", "nzm", "sarai kale khan"]
        },
        "bus": {
            "name": "Kashmere Gate ISBT",
            "lat": 28.6675,
            "lng": 77.2282,
            "aliases": ["isbt", "kashmere gate", "bus stand", "bus terminal"]
        },
        "center": {
            "name": "Connaught Place Central Hub (Delhi)",
            "lat": 28.6315,
            "lng": 77.2167,
            "aliases": ["connaught place", "cp", "central delhi", "rajiv chowk"]
        }
    },
    "jaipur": {
        "airport": {
            "name": "Jaipur International Airport (JAI)",
            "lat": 26.8242,
            "lng": 75.8122,
            "aliases": ["airport", "jai airport", "sanganer", "flight"]
        },
        "station": {
            "name": "Jaipur Junction Railway Station",
            "lat": 26.9196,
            "lng": 75.7878,
            "aliases": ["station", "jaipur junction", "railway station", "train", "jp"]
        },
        "bus": {
            "name": "Sindhi Camp Central Bus Stand",
            "lat": 26.9248,
            "lng": 75.7997,
            "aliases": ["sindhi camp", "bus stand", "bus station", "isbt jaipur"]
        },
        "center": {
            "name": "Ajmeri Gate / MI Road (Jaipur)",
            "lat": 26.9168,
            "lng": 75.8202,
            "aliases": ["mi road", "ajmeri gate", "pink city center", "walled city"]
        }
    }
}

class LocationResolver:
    """
    Deterministically resolves location names or origin preferences
    into verified geographical coordinates (lat, lng).
    """

    @classmethod
    def resolve_origin(
        cls, 
        destination: str, 
        start_location: Optional[str] = None,
        origin_type: Optional[str] = "hotel"
    ) -> Tuple[str, float, float]:
        """
        Resolves origin to (display_name, lat, lng).
        Guarantees that Delhi uses Delhi coordinates, Jaipur uses Jaipur, etc.
        """
        city_key = destination.strip().lower()
        city_dict = CITY_HUBS.get(city_key)

        if not city_dict:
            # Fallback to Hyderabad if unknown city
            city_dict = CITY_HUBS["hyderabad"]
            city_key = "hyderabad"

        default_hub = city_dict["station"]

        # If user explicitly provided a query name (e.g., "Airport", "Secunderabad")
        if start_location and start_location.strip():
            query_clean = start_location.strip().lower()
            
            # Check for direct or alias matches in the destination city
            for hub_key, hub_data in city_dict.items():
                if query_clean == hub_data["name"].lower():
                    return hub_data["name"], hub_data["lat"], hub_data["lng"]
                for alias in hub_data.get("aliases", []):
                    if alias in query_clean:
                        return hub_data["name"], hub_data["lat"], hub_data["lng"]

            # If user typed a custom label without a known alias, return custom name with default hub coords
            return start_location.strip(), default_hub["lat"], default_hub["lng"]

        # If origin_type was passed (e.g. 'airport', 'station', 'bus', 'center', 'hotel')
        clean_origin = origin_type.lower().strip() if origin_type else "center"
        if clean_origin in ["hotel", "center"]:
            hub = city_dict.get("center") or default_hub
            return hub["name"], hub["lat"], hub["lng"]
        elif clean_origin in city_dict:
            hub = city_dict[clean_origin]
            return hub["name"], hub["lat"], hub["lng"]

        return default_hub["name"], default_hub["lat"], default_hub["lng"]
