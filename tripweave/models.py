from enum import Enum
from datetime import date, timedelta
from typing import List, Optional, Dict
from pydantic import BaseModel, Field, model_validator

# --- ENUMS (Strict Typed Allowed Values) ---

class TransportMode(str, Enum):
    CAB = "cab"
    AUTO = "auto"
    METRO = "metro"
    WALK = "walk"

class PacePreference(str, Enum):
    RELAXED = "relaxed"      # 1-2 activities/day
    BALANCED = "balanced"    # 2-3 activities/day
    INTENSIVE = "intensive"  # 3-4 activities/day

class PlanVariantType(str, Enum):
    BUDGET = "budget"        # Lower cost lodging, relaxed pace
    BALANCED = "balanced"    # Optimal trade-off, iconic moments
    COMFORT = "comfort"      # Premium stay, intensive sightseeing

# --- INPUT INTENT (What the user wants) ---

class HotelPreference(BaseModel):
    min_price_per_night_inr: Optional[int] = Field(None, ge=0, description="Minimum room rate per night in INR")
    max_price_per_night_inr: Optional[int] = Field(None, ge=0, description="Maximum room rate per night in INR")

class TransportPreference(BaseModel):
    mode: TransportMode = Field(default=TransportMode.CAB, description="Primary mode of transportation")
    max_budget_inr: Optional[int] = Field(None, gt=0, description="Capped budget reserved strictly for travel")

class TripRequest(BaseModel):
    destination: str = Field(..., min_length=2, description="Target city (e.g. 'Hyderabad', 'Delhi', 'Jaipur')")
    start_date: Optional[date] = Field(None, description="Trip start date (YYYY-MM-DD)")
    end_date: Optional[date] = Field(None, description="Trip end date (YYYY-MM-DD)")
    days: Optional[int] = Field(None, gt=0, le=14, description="Trip duration in days (auto-computed if dates provided)")
    budget_inr: int = Field(..., gt=0, description="Total budget in INR")
    people_count: int = Field(..., gt=0, le=20, description="Number of travelers (1 to 20)")
    interests: List[str] = Field(default_factory=list, description="User tags/interests (e.g. ['history', 'food'])")
    pace: PacePreference = Field(default=PacePreference.BALANCED, description="Trip intensity/pace")
    start_location: Optional[str] = Field(None, description="Optional starting hub for day trips (e.g. 'Secunderabad Railway Station')")
    hotel_pref: Optional[HotelPreference] = None
    transport_pref: Optional[TransportPreference] = None

    @model_validator(mode="before")
    @classmethod
    def resolve_dates_and_days(cls, data):
        if isinstance(data, dict):
            start = data.get("start_date")
            end = data.get("end_date")
            days = data.get("days")

            # Parse string dates if provided as strings
            if isinstance(start, str):
                start = date.fromisoformat(start)
                data["start_date"] = start
            if isinstance(end, str):
                end = date.fromisoformat(end)
                data["end_date"] = end

            if start and end:
                if end < start:
                    raise ValueError("end_date cannot be earlier than start_date")
                calculated_days = (end - start).days + 1
                data["days"] = calculated_days
            elif days and not start:
                # Fallback: start today
                today = date.today()
                data["start_date"] = today
                data["end_date"] = today + timedelta(days=days - 1)
            elif not days and not start:
                raise ValueError("Must provide either (start_date and end_date) or days.")
        return data

# --- CORE DATA (The places we can choose from) ---

class ViewpointRecommendation(BaseModel):
    viewpoint_name: str
    description: str
    best_moment: str  # e.g., "Golden Hour (5:15 PM - 6:15 PM)" or "Night Illumination"
    pro_tip: str      # e.g., "Rooftop seating with Irani Chai and Osmania biscuits"

class Place(BaseModel):
    place_id: str
    name: str
    place_type: str  # 'attraction', 'restaurant', 'hotel'
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    duration_minutes: int = Field(..., ge=0)
    estimated_cost_per_person_inr: int = Field(default=0, ge=0, description="Admission ticket or estimated meal expense per person")
    entry_fee_inr: Optional[int] = Field(None, ge=0, description="Legacy alias for estimated_cost_per_person_inr")
    tags: List[str] = Field(default_factory=list)
    open_time_mins: Optional[int] = None   # Minutes from 8:00 AM
    close_time_mins: Optional[int] = None  # Minutes from 8:00 AM
    closed_days: List[str] = Field(default_factory=list, description="Days of the week when closed, e.g. ['friday']")
    
    @model_validator(mode="before")
    @classmethod
    def sync_cost_fields(cls, data):
        if isinstance(data, dict):
            if "entry_fee_inr" in data and ("estimated_cost_per_person_inr" not in data or data["estimated_cost_per_person_inr"] == 0):
                data["estimated_cost_per_person_inr"] = data["entry_fee_inr"]
        return data
    
    # Hotel specific fields
    price_per_night_inr: Optional[int] = Field(None, ge=0)
    max_guests_per_room: int = Field(default=2, ge=1, le=10)
    data_source: Optional[str] = Field(None, description="Data provenance note")
    
    # Experience Intelligence
    golden_hour_recommended: bool = False
    night_view_recommended: bool = False
    best_viewpoints: List[ViewpointRecommendation] = Field(default_factory=list)

# --- OUTPUT ITINERARY (What the engine produces) ---

class HotelStaySummary(BaseModel):
    hotel_id: str = Field(default="", description="Unique ID of the hotel or day-trip depot")
    hotel_name: str
    lat: float = Field(default=0.0, description="Hotel latitude for map pin")
    lng: float = Field(default=0.0, description="Hotel longitude for map pin")
    price_per_night_per_room: int
    rooms_needed: int
    nights: int
    people_accommodated: int
    total_cost_inr: int
    provenance: str = Field(..., description="Clear provenance note of the rate")
    why_this_hotel: Optional[str] = Field(None, description="Decision trace explaining why this hotel was selected")

class ScheduledActivity(BaseModel):
    place_name: str
    lat: float = Field(default=0.0, description="Activity latitude for map pin")
    lng: float = Field(default=0.0, description="Activity longitude for map pin")
    start_time: str
    end_time: str
    estimated_cost_inr: int
    experience_tag: Optional[str] = None
    recommended_viewpoint: Optional[ViewpointRecommendation] = None

class DayPlan(BaseModel):
    day_number: int
    date: Optional[str] = None           # e.g. "2026-10-16"
    day_of_week: Optional[str] = None    # e.g. "Friday"
    cluster_name: Optional[str] = None   # e.g. "Historic Heritage Hub"
    activities: List[ScheduledActivity]
    day_cost_inr: int

class TripPlan(BaseModel):
    plan_name: str
    variant_type: PlanVariantType = PlanVariantType.BALANCED
    hotel_summary: Optional[HotelStaySummary] = None
    estimated_transport_cost_inr: int = 0
    transport_mode: TransportMode
    transport_budget_status: str = Field(default="Within budget", description="Status of transport spend relative to user cap")
    days: List[DayPlan]
    total_cost_inr: int
    disclaimer: str = Field(
        default="Estimated local subtotal. Excludes intercity transit, lodging taxes/GST, and unmodeled expenses.",
        description="Cost transparency disclaimer"
    )

class MultiVariantTripPlan(BaseModel):
    destination: str
    travel_dates: str
    variants: Dict[str, TripPlan] = Field(..., description="The 3 diverse plan variants: budget, balanced, comfort")
