from enum import Enum
from typing import List, Optional
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

# --- INPUT INTENT (What the user wants) ---

class HotelPreference(BaseModel):
    min_price_per_night_inr: Optional[int] = Field(None, ge=0, description="Minimum room rate per night in INR")
    max_price_per_night_inr: Optional[int] = Field(None, ge=0, description="Maximum room rate per night in INR")

class TransportPreference(BaseModel):
    mode: TransportMode = Field(default=TransportMode.CAB, description="Primary mode of transportation")
    max_budget_inr: Optional[int] = Field(None, gt=0, description="Capped budget reserved strictly for travel")

class TripRequest(BaseModel):
    destination: str = Field(..., min_length=2, description="Target city (e.g. 'Hyderabad')")
    days: int = Field(..., gt=0, le=14, description="Trip duration in days (1 to 14)")
    budget_inr: int = Field(..., gt=0, description="Total budget in INR")
    people_count: int = Field(..., gt=0, le=20, description="Number of travelers (1 to 20)")
    interests: List[str] = Field(default_factory=list, description="User tags/interests (e.g. ['history', 'food'])")
    pace: PacePreference = Field(default=PacePreference.BALANCED, description="Trip intensity/pace")
    start_location: Optional[str] = Field(None, description="Optional starting hub for day trips (e.g. 'Secunderabad Railway Station')")
    hotel_pref: Optional[HotelPreference] = None
    transport_pref: Optional[TransportPreference] = None

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
    price_per_night_per_room: int
    rooms_needed: int
    nights: int
    people_accommodated: int
    total_cost_inr: int
    provenance: str = Field(..., description="Clear, honest provenance of the rate")

class ScheduledActivity(BaseModel):
    place_name: str
    start_time: str
    end_time: str
    estimated_cost_inr: int
    experience_tag: Optional[str] = None
    recommended_viewpoint: Optional[ViewpointRecommendation] = None

class DayPlan(BaseModel):
    day_number: int
    activities: List[ScheduledActivity]
    day_cost_inr: int

class TripPlan(BaseModel):
    plan_name: str
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
