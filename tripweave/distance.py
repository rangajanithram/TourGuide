import math

def calculate_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """1 degree of lat/lng difference is roughly 111 km."""
    return math.hypot(lat1 - lat2, lng1 - lng2) * 111

def get_travel_metrics(lat1: float, lng1: float, lat2: float, lng2: float, mode: str = "cab", people_count: int = 1) -> tuple[int, int]:
    """
    Returns (travel_time_minutes, estimated_cost_inr) based on transport mode.
    All costs reflect typical Indian metro rates without hallucination.
    """
    distance_km = calculate_distance_km(lat1, lng1, lat2, lng2)
    
    if mode == "walk":
        speed_kmh = 4.5
        cost = 0
        minutes = int((distance_km / speed_kmh) * 60)
        return max(5, minutes), 0
        
    elif mode == "auto":
        speed_kmh = 20.0
        # ₹30 base fare (includes first 1.5 km) + ₹15/km
        cost = int(30 + max(0, distance_km - 1.5) * 15)
        minutes = int((distance_km / speed_kmh) * 60) + 5  # 5 min wait/traffic
        return max(7, minutes), cost
        
    elif mode == "metro":
        # Rapid transit speed between stations
        speed_kmh = 32.0
        # ₹35 avg ticket per person
        cost = 35 * people_count
        minutes = int((distance_km / speed_kmh) * 60) + 12 # 12 min walking to/from station & ticketing
        return max(15, minutes), cost
        
    else:  # "cab" (Uber/Ola/taxi)
        speed_kmh = 24.0
        # ₹50 base fare + ₹20/km
        cost = int(50 + distance_km * 20)
        minutes = int((distance_km / speed_kmh) * 60) + 7  # 7 min pickup wait & parking
        return max(10, minutes), cost

def get_mock_travel_time_minutes(lat1: float, lng1: float, lat2: float, lng2: float, mode: str = "cab") -> int:
    """Legacy helper for backward compatibility."""
    mins, _ = get_travel_metrics(lat1, lng1, lat2, lng2, mode)
    return mins

