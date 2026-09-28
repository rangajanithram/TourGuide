"""
Inter-City Transit Intelligence Provider for TripWeave.
Curated cross-city transport comparison (Train, Bus, Flight) across supported cities,
with arrival station to centroid hotel last-mile reconciliation per Blueprint Section 1 & Product Spec Feature 1.
"""
import os
import json
from typing import List, Optional, Dict
from pydantic import BaseModel, Field

from tripweave.config import settings
from tripweave.geocoding import LocationResolver
from tripweave.distance import calculate_distance_km, get_travel_metrics

class InterCityRoute(BaseModel):
    route_id: str
    origin_city: str
    destination_city: str
    mode: str = Field(..., description="'train', 'bus', or 'flight'")
    operator_name: str
    service_number: Optional[str] = None
    departure_station: str
    departure_hub_key: Optional[str] = "station"
    arrival_station: str
    arrival_hub_key: Optional[str] = "station"
    departure_window: str
    typical_duration_min: int
    typical_fare_min: int
    typical_fare_max: int
    fare_class: str
    availability_status: str = "available"
    recommendation_badge: Optional[str] = None
    last_mile_note: str
    notes: Optional[str] = None
    source: str = "Curated Intercity Transit Schedule (2026)"
    verified_at: str = "2026-09-01"

class LastMileConnection(BaseModel):
    arrival_terminal: str
    destination_hotel: str
    distance_km: float
    estimated_time_min: int
    estimated_cost_inr: int
    recommended_mode: str = "auto"
    guidance: str

class InterCityTransportSummary(BaseModel):
    origin_city: str
    destination_city: str
    recommended_option: InterCityRoute
    all_options: List[InterCityRoute] = Field(default_factory=list)
    transit_advice: str
    last_mile: Optional[LastMileConnection] = None

class InterCityTransportProvider:
    """
    Curated database provider for intercity transit schedules and recommendations.
    """
    def __init__(self, data_path: Optional[str] = None):
        if data_path:
            self.data_path = data_path
        else:
            base_project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.data_path = os.path.join(base_project_dir, settings.data_dir, "intercity_transport_mock.json")
            
        self._routes: List[InterCityRoute] = []
        self._load_data()

    def _load_data(self):
        if not os.path.exists(self.data_path):
            self._routes = []
            return
            
        with open(self.data_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        self._routes = [InterCityRoute(**item) for item in raw]

    def get_routes(self, origin_city: str, destination_city: str) -> List[InterCityRoute]:
        orig = origin_city.strip().lower()
        dest = destination_city.strip().lower()
        return [r for r in self._routes if r.origin_city == orig and r.destination_city == dest]

    def get_transport_summary(
        self,
        origin_city: str,
        destination_city: str,
        hotel_name: str,
        hotel_lat: float,
        hotel_lng: float,
        variant_type: str = "balanced",
        people_count: int = 1
    ) -> Optional[InterCityTransportSummary]:
        routes = self.get_routes(origin_city, destination_city)
        if not routes:
            return None

        # Select recommended route tailored to variant
        v = variant_type.lower()
        recommended: InterCityRoute
        if v == "budget":
            # Prefer lowest min fare (bus or budget train)
            sorted_by_fare = sorted(routes, key=lambda r: r.typical_fare_min)
            recommended = sorted_by_fare[0]
        elif v == "comfort":
            # Prefer fastest or premium flight/express
            flights = [r for r in routes if r.mode == "flight"]
            if flights:
                recommended = sorted(flights, key=lambda r: r.typical_duration_min)[0]
            else:
                recommended = sorted(routes, key=lambda r: r.typical_duration_min)[0]
        else:
            # Balanced: prefer Vande Bharat / Superfast Train or best value
            trains = [r for r in routes if r.mode == "train"]
            if trains:
                recommended = sorted(trains, key=lambda r: r.typical_duration_min)[0]
            else:
                recommended = routes[0]

        # Compute last mile from recommended arrival terminal to hotel
        last_mile: Optional[LastMileConnection] = None
        if hotel_lat != 0.0 and hotel_lng != 0.0 and recommended.arrival_hub_key:
            try:
                dest_clean = destination_city.strip().lower()
                hub_name, arr_lat, arr_lng = LocationResolver.resolve_hub(dest_clean, recommended.arrival_hub_key)
                dist_km = calculate_distance_km(arr_lat, arr_lng, hotel_lat, hotel_lng)
                
                # Pick auto for < 10 km, cab for longer
                last_mile_mode = "auto" if dist_km < 10.0 else "cab"
                time_min, cost_inr = get_travel_metrics(
                    arr_lat, arr_lng, hotel_lat, hotel_lng,
                    mode=last_mile_mode, people_count=people_count
                )
                guidance = f"From {recommended.arrival_station}, take a {last_mile_mode} (~{time_min} mins, ₹{cost_inr}) directly to {hotel_name}."
                last_mile = LastMileConnection(
                    arrival_terminal=recommended.arrival_station,
                    destination_hotel=hotel_name,
                    distance_km=round(dist_km, 2),
                    estimated_time_min=time_min,
                    estimated_cost_inr=cost_inr,
                    recommended_mode=last_mile_mode,
                    guidance=guidance
                )
            except Exception:
                last_mile = None

        # Generate contextual advice
        advice = self._build_advice(origin_city, destination_city, recommended, variant_type)

        return InterCityTransportSummary(
            origin_city=origin_city.capitalize(),
            destination_city=destination_city.capitalize(),
            recommended_option=recommended,
            all_options=routes,
            transit_advice=advice,
            last_mile=last_mile
        )

    def _build_advice(self, origin: str, dest: str, rec: InterCityRoute, variant: str) -> str:
        dur_h = rec.typical_duration_min // 60
        dur_m = rec.typical_duration_min % 60
        dur_str = f"{dur_h}h {dur_m}m" if dur_m > 0 else f"{dur_h}h"
        
        if rec.mode == "flight":
            return f"Direct air connection via {rec.operator_name} ({dur_str}). Best for saving sightseeing time."
        elif rec.mode == "train":
            return f"Recommended: {rec.operator_name} ({dur_str}) arriving at {rec.arrival_station}. Comfortable and scenic."
        else:
            return f"Economical: {rec.operator_name} ({dur_str}) dropping at {rec.arrival_station}. Overnight schedule saves a hotel room night."

# Singleton instance
_transport_provider_instance: Optional[InterCityTransportProvider] = None

def get_transport_provider() -> InterCityTransportProvider:
    global _transport_provider_instance
    if _transport_provider_instance is None:
        _transport_provider_instance = InterCityTransportProvider()
    return _transport_provider_instance
