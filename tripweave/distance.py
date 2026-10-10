import math
from functools import lru_cache

@lru_cache(maxsize=4096)
def _cached_haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    if lat1 == lat2 and lng1 == lng2:
        return 0.0
    r = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return r * c

def calculate_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Great-Circle Distance using the Haversine formula on Earth sphere (R = 6371.0088 km).
    Accurate for spherical coordinates worldwide, accelerated via LRU cache.
    """
    return _cached_haversine(round(lat1, 6), round(lng1, 6), round(lat2, 6), round(lng2, 6))

def get_travel_metrics(lat1: float, lng1: float, lat2: float, lng2: float, mode: str = "cab", people_count: int = 1) -> tuple[int, int]:
    """
    Returns (travel_time_minutes, estimated_cost_inr) based on transport mode.
    Applies urban road curvature factor (1.25x for road vehicles) and standard metro/auto fares.
    """
    straight_km = calculate_distance_km(lat1, lng1, lat2, lng2)
    if straight_km < 0.01:
        return 0, 0
    party_size = max(1, people_count)
    # Urban road factor (city street layout is not straight-line)
    road_km = straight_km * 1.25 if mode in ("cab", "auto", "walk") else straight_km
    
    if mode == "walk":
        speed_kmh = 4.5
        cost = 0
        minutes = int((road_km / speed_kmh) * 60)
        return max(5, minutes), 0
        
    elif mode == "auto":
        speed_kmh = 20.0
        # ₹30 base fare (includes first 1.5 km) + ₹15/km
        per_vehicle_cost = int(30 + max(0, road_km - 1.5) * 15)
        # Indicative urban capacity: up to 3 passengers per auto-rickshaw.
        cost = per_vehicle_cost * math.ceil(party_size / 3)
        minutes = int((road_km / speed_kmh) * 60) + 5  # 5 min wait/traffic
        return max(7, minutes), cost
        
    elif mode == "metro":
        # Rapid transit speed between stations
        speed_kmh = 32.0
        # ₹35 avg ticket per person
        cost = 35 * party_size
        minutes = int((straight_km / speed_kmh) * 60) + 12 # 12 min walking to/from station & ticketing
        return max(15, minutes), cost
        
    else:  # "cab" (Uber/Ola/taxi)
        speed_kmh = 24.0
        # ₹50 base fare + ₹20/km
        per_vehicle_cost = int(50 + road_km * 20)
        # Indicative capacity: up to 4 passengers per standard cab.
        cost = per_vehicle_cost * math.ceil(party_size / 4)
        minutes = int((road_km / speed_kmh) * 60) + 7  # 7 min pickup wait & parking
        return max(10, minutes), cost

def get_mock_travel_time_minutes(lat1: float, lng1: float, lat2: float, lng2: float, mode: str = "cab") -> int:
    """Legacy helper for backward compatibility."""
    mins, _ = get_travel_metrics(lat1, lng1, lat2, lng2, mode)
    return mins

def compute_detour_cost_rupees(
    extra_km: float, 
    extra_min: int,
    per_km_rs: float = 12.0,
    time_value_rs_per_min: float = 2.0
) -> float:
    """
    Blueprint Section 6 Detour Penalty Function:
    Converts detour distance and opportunity time into ₹ before combining — never mixes units.
    """
    return (max(0.0, extra_km) * per_km_rs) + (max(0, extra_min) * time_value_rs_per_min)

