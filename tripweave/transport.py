"""
Inter-City Transit Intelligence Provider for TripWeave.
Curated cross-city transport comparison (Train, Bus, Flight) across supported cities,
with arrival station to centroid hotel last-mile reconciliation per Blueprint Section 1 & Product Spec Feature 1.
"""
import os
import json
from datetime import date
from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field, model_validator

from tripweave.config import settings
from tripweave.geocoding import LocationResolver
from tripweave.distance import calculate_distance_km, get_travel_metrics

class InterCityRoute(BaseModel):
    route_id: str
    origin_city: str
    destination_city: str
    mode: Literal["train", "bus", "flight"]
    operator_name: str
    service_number: Optional[str] = None
    departure_station: str
    departure_hub_key: Optional[str] = "station"
    arrival_station: str
    arrival_hub_key: Optional[str] = "station"
    departure_window: str
    typical_duration_min: int = Field(..., gt=0)
    typical_fare_min: int = Field(..., ge=0)
    typical_fare_max: int = Field(..., ge=0)
    fare_class: str
    availability_status: str = "indicative_schedule"
    # Monday=0 ... Sunday=6. None means the curated record has no verified
    # weekday operating data, so it must never be presented as date-confirmed.
    operating_days: Optional[List[int]] = None
    recommendation_badge: Optional[str] = None
    last_mile_note: str
    notes: Optional[str] = None
    source: str = "TripWeave curated estimate; confirm with the transport operator"
    verified_at: Optional[str] = None

    @model_validator(mode="after")
    def validate_route_values(self):
        if self.typical_fare_max < self.typical_fare_min:
            raise ValueError("typical_fare_max must be greater than or equal to typical_fare_min")
        if self.operating_days is not None and any(day < 0 or day > 6 for day in self.operating_days):
            raise ValueError("operating_days values must use Monday=0 through Sunday=6")
        return self

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
    return_option: Optional[InterCityRoute] = None
    all_options: List[InterCityRoute] = Field(default_factory=list)
    all_return_options: List[InterCityRoute] = Field(default_factory=list)
    transit_advice: str
    last_mile: Optional[LastMileConnection] = None
    return_last_mile: Optional[LastMileConnection] = None

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

    def _select_best_route(self, routes: List[InterCityRoute], variant_type: str) -> InterCityRoute:
        if not routes:
            raise ValueError("Cannot recommend a route from an empty route list")
        v = variant_type.lower()
        if v == "budget":
            # Prefer lowest min fare (bus or budget train)
            return sorted(routes, key=lambda r: r.typical_fare_min)[0]
        elif v == "comfort":
            # Prefer fastest or premium flight/express
            flights = [r for r in routes if r.mode == "flight"]
            if flights:
                return sorted(flights, key=lambda r: r.typical_duration_min)[0]
            return sorted(routes, key=lambda r: r.typical_duration_min)[0]
        else:
            # Balanced: prefer Vande Bharat / Superfast Train or best value
            trains = [r for r in routes if r.mode == "train"]
            if trains:
                return sorted(trains, key=lambda r: r.typical_duration_min)[0]
            return routes[0]

    @staticmethod
    def route_operates_on_date(route: InterCityRoute, travel_date: Optional[date]) -> Optional[bool]:
        """Return True/False only when weekday data is explicitly recorded.

        None means the route's schedule has not been date-verified; descriptive
        text in departure_window is intentionally not parsed as structured data.
        """
        if travel_date is None or route.operating_days is None:
            return None
        return travel_date.weekday() in route.operating_days

    def get_transport_summary(
        self,
        origin_city: str,
        destination_city: str,
        hotel_name: str,
        hotel_lat: float,
        hotel_lng: float,
        variant_type: str = "balanced",
        people_count: int = 1,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Optional[InterCityTransportSummary]:
        routes = self.get_routes(origin_city, destination_city)
        if not routes:
            return None

        # Prefer a route explicitly recorded as operating on the departure date.
        # Curated mock rows currently have no such data, so keep the normal
        # variant recommendation but surface that schedule status is unknown.
        v = variant_type.lower()
        outbound_on_date = [r for r in routes if self.route_operates_on_date(r, start_date) is True]
        outbound_unverified = [r for r in routes if self.route_operates_on_date(r, start_date) is None]
        outbound_warning = None
        if outbound_on_date:
            recommended = self._select_best_route(outbound_on_date, v)
        else:
            recommended = self._select_best_route(outbound_unverified or routes, v)
            if start_date is not None:
                outbound_warning = f"Outbound service weekday operation is unverified for {start_date.strftime('%A')}; confirm the indicative schedule with the operator."

        # Date compatibility check for return leg
        return_dow_full = end_date.strftime("%A") if end_date else None
        date_warning = outbound_warning

        # Look up return routes (destination -> origin)
        return_routes = self.get_routes(destination_city, origin_city)
        return_option: Optional[InterCityRoute] = None

        if return_routes:
            matching_mode_return = [r for r in return_routes if r.mode == recommended.mode]
            operating_matching = [r for r in matching_mode_return if self.route_operates_on_date(r, end_date) is True]
            operating_all = [r for r in return_routes if self.route_operates_on_date(r, end_date) is True]
            unverified_matching = [r for r in matching_mode_return if self.route_operates_on_date(r, end_date) is None]
            unverified_all = [r for r in return_routes if self.route_operates_on_date(r, end_date) is None]

            if operating_matching:
                return_option = self._select_best_route(operating_matching, v)
            elif operating_all:
                return_option = self._select_best_route(operating_all, v)
                return_warning = f"No date-matched {recommended.mode} record is available for {return_dow_full or 'your return date'}; selected a route with structured weekday data. Confirm with the operator."
            elif unverified_matching:
                return_option = self._select_best_route(unverified_matching, v)
                return_warning = f"Return service weekday operation is unverified for {return_dow_full or 'your date'}; confirm the indicative schedule with the operator."
            elif unverified_all:
                return_option = self._select_best_route(unverified_all, v)
                return_warning = f"Return service weekday operation is unverified for {return_dow_full or 'your date'}; confirm the indicative schedule with the operator."
            else:
                return_option = self._select_best_route(matching_mode_return or return_routes, v)
                return_warning = f"No return service is recorded as operating on {return_dow_full or 'your return date'}. The displayed option is an unconfirmed fallback; check before travel."
            date_warning = " ".join(warning for warning in (date_warning, return_warning) if warning)
        else:
            # Explicit symmetric estimate with clear provenance
            return_option = InterCityRoute(
                route_id=f"ret_{recommended.route_id}",
                origin_city=destination_city.lower(),
                destination_city=origin_city.lower(),
                mode=recommended.mode,
                operator_name=f"{recommended.operator_name} (Return Leg)",
                service_number=None,
                departure_station=recommended.arrival_station,
                departure_hub_key=recommended.arrival_hub_key,
                arrival_station=recommended.departure_station,
                arrival_hub_key=recommended.departure_hub_key,
                departure_window=f"Estimated reverse schedule ({recommended.mode})",
                typical_duration_min=recommended.typical_duration_min,
                typical_fare_min=recommended.typical_fare_min,
                typical_fare_max=recommended.typical_fare_max,
                fare_class=recommended.fare_class,
                availability_status="indicative_schedule",
                recommendation_badge="Indicative Return Estimate",
                last_mile_note=f"Returns to {recommended.departure_station}",
                notes="Estimated reverse route schedule benchmark based on outbound rates. Check operator portal for exact schedules.",
                source=recommended.source,
                verified_at=None
            )

        # Compute outbound last-mile: arrival terminal -> hotel
        last_mile: Optional[LastMileConnection] = None
        if hotel_lat != 0.0 and hotel_lng != 0.0 and recommended.arrival_hub_key:
            try:
                dest_clean = destination_city.strip().lower()
                hub_name, arr_lat, arr_lng = LocationResolver.resolve_hub(dest_clean, recommended.arrival_hub_key)
                dist_km = calculate_distance_km(arr_lat, arr_lng, hotel_lat, hotel_lng)
                last_mile_mode = "auto" if dist_km < 10.0 else "cab"
                time_min, cost_inr = get_travel_metrics(
                    arr_lat, arr_lng, hotel_lat, hotel_lng,
                    mode=last_mile_mode, people_count=people_count
                )
                guidance = f"From arrival terminal ({recommended.arrival_station}), take a {last_mile_mode} (~{time_min} mins, ₹{cost_inr}) directly to {hotel_name}."
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

        # Compute return last-mile: hotel -> departure terminal in destination city
        return_last_mile: Optional[LastMileConnection] = None
        if hotel_lat != 0.0 and hotel_lng != 0.0 and return_option and return_option.departure_hub_key:
            try:
                dest_clean = destination_city.strip().lower()
                hub_name, dep_lat, dep_lng = LocationResolver.resolve_hub(dest_clean, return_option.departure_hub_key)
                dist_km = calculate_distance_km(hotel_lat, hotel_lng, dep_lat, dep_lng)
                ret_last_mile_mode = "auto" if dist_km < 10.0 else "cab"
                time_min, cost_inr = get_travel_metrics(
                    hotel_lat, hotel_lng, dep_lat, dep_lng,
                    mode=ret_last_mile_mode, people_count=people_count
                )
                guidance = f"On departure day, travel from {hotel_name} to return departure terminal ({return_option.departure_station}) via {ret_last_mile_mode} (~{time_min} mins, ₹{cost_inr})."
                return_last_mile = LastMileConnection(
                    arrival_terminal=return_option.departure_station,
                    destination_hotel=hotel_name,
                    distance_km=round(dist_km, 2),
                    estimated_time_min=time_min,
                    estimated_cost_inr=cost_inr,
                    recommended_mode=ret_last_mile_mode,
                    guidance=guidance
                )
            except Exception:
                return_last_mile = None

        # Generate contextual advice
        advice = self._build_advice(origin_city, destination_city, recommended, variant_type)
        if date_warning:
            advice = f"{advice} {date_warning}"

        return InterCityTransportSummary(
            origin_city=origin_city.capitalize(),
            destination_city=destination_city.capitalize(),
            recommended_option=recommended,
            return_option=return_option,
            all_options=routes,
            all_return_options=return_routes,
            transit_advice=advice,
            last_mile=last_mile,
            return_last_mile=return_last_mile
        )

    def _build_advice(self, origin: str, dest: str, rec: InterCityRoute, variant: str) -> str:
        dur_h = rec.typical_duration_min // 60
        dur_m = rec.typical_duration_min % 60
        dur_str = f"{dur_h}h {dur_m}m" if dur_m > 0 else f"{dur_h}h"
        
        is_overnight = (
            "overnight" in rec.departure_window.lower() or 
            (bool(rec.notes) and "overnight" in rec.notes.lower()) or 
            (bool(rec.notes) and "saves 1 night" in rec.notes.lower())
        )
        
        if rec.mode == "flight":
            return f"Direct air connection via {rec.operator_name} ({dur_str}). Best for saving sightseeing time."
        elif rec.mode == "train":
            overnight_tip = " Overnight journey saves a hotel room night." if is_overnight else " Comfortable and scenic rail connection."
            return f"Recommended: {rec.operator_name} ({dur_str}) arriving at {rec.arrival_station}.{overnight_tip}"
        else:
            overnight_tip = " Overnight schedule saves a hotel room night." if is_overnight else " Economical daytime highway route."
            return f"Economical: {rec.operator_name} ({dur_str}) dropping at {rec.arrival_station}.{overnight_tip}"

# Singleton instance
_transport_provider_instance: Optional[InterCityTransportProvider] = None

def get_transport_provider() -> InterCityTransportProvider:
    global _transport_provider_instance
    if _transport_provider_instance is None:
        _transport_provider_instance = InterCityTransportProvider()
    return _transport_provider_instance
