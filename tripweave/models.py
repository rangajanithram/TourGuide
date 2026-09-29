from enum import Enum
from datetime import date, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, model_validator, ConfigDict
from tripweave.crowd import CrowdForecast
from tripweave.transport import InterCityTransportSummary

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

class GroupProfile(str, Enum):
    DEFAULT = "default"        # General travelers
    YOUNG_SOLO = "young_solo"  # Solo / young active explorer
    FAMILY = "family"          # Family with children / moderate pace
    ELDERLY = "elderly"        # Seniors / accessibility conscious

# --- INPUT INTENT (What the user wants) ---

class HotelPreference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min_price_per_night_inr: Optional[int] = Field(None, ge=0, description="Minimum room rate per night in INR")
    max_price_per_night_inr: Optional[int] = Field(None, ge=0, description="Maximum room rate per night in INR")

class TransportPreference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: TransportMode = Field(default=TransportMode.CAB, description="Primary mode of transportation")
    max_budget_inr: Optional[int] = Field(None, gt=0, description="Capped budget reserved strictly for travel")

class TripRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    origin_city: Optional[str] = Field(None, description="Optional departure city for inter-city travel recommendations (e.g. 'Bengaluru', 'Mumbai', 'Delhi')")
    destination: str = Field(..., min_length=2, description="Target city (e.g. 'Hyderabad', 'Delhi', 'Jaipur')")
    start_date: Optional[date] = Field(None, description="Trip start date (YYYY-MM-DD)")
    end_date: Optional[date] = Field(None, description="Trip end date (YYYY-MM-DD)")
    days: Optional[int] = Field(None, gt=0, le=14, description="Trip duration in days (auto-computed if dates provided)")
    budget_inr: int = Field(..., gt=0, description="Total budget in INR")
    people_count: int = Field(..., gt=0, le=20, description="Number of travelers (1 to 20)")
    interests: List[str] = Field(default_factory=list, description="User tags/interests (e.g. ['history', 'food'])")
    pace: PacePreference = Field(default=PacePreference.BALANCED, description="Trip intensity/pace")
    start_location: Optional[str] = Field(None, description="Optional starting hub for day trips (e.g. 'Secunderabad Railway Station')")
    origin_type: Optional[str] = Field("hotel", description="Trip starting origin type: 'hotel', 'station', 'airport', 'custom'")
    transport_mode: Optional[TransportMode] = Field(None, description="Primary transport mode shorthand")
    group_profile: GroupProfile = Field(default=GroupProfile.DEFAULT, description="Traveler group profile for calibrated pacing & fatigue")
    locked_activities: List[str] = Field(default_factory=list, description="User-pinned activities that must be included")
    hotel_pref: Optional[HotelPreference] = None
    transport_pref: Optional[TransportPreference] = None

    @model_validator(mode="before")
    @classmethod
    def resolve_dates_and_days(cls, data):
        if isinstance(data, dict):
            # 1. Map top-level transport_mode to transport_pref if not already set
            if "transport_mode" in data and not data.get("transport_pref"):
                raw_mode = data["transport_mode"]
                mode_str = raw_mode.value if hasattr(raw_mode, "value") else str(raw_mode).lower()
                data["transport_pref"] = TransportPreference(mode=TransportMode(mode_str))

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

            # Validate explicit days parameter if provided
            if days is not None:
                if not isinstance(days, int) or days < 1 or days > 14:
                    raise ValueError(f"Trip duration must be between 1 and 14 days (got {days}).")

            # 2. Comprehensive Date/Days Resolution (Handling all partial inputs)
            if start and end:
                if end < start:
                    raise ValueError("end_date cannot be earlier than start_date")
                calculated_days = (end - start).days + 1
                if calculated_days > 14:
                    raise ValueError(f"Trip duration cannot exceed 14 days (requested {calculated_days} days).")
                data["days"] = calculated_days
            elif start and days is not None and not end:
                data["end_date"] = start + timedelta(days=days - 1)
            elif end and days is not None and not start:
                data["start_date"] = end - timedelta(days=days - 1)
            elif start and not end and days is None:
                # Default to 3-day itinerary starting on start_date
                data["days"] = 3
                data["end_date"] = start + timedelta(days=2)
            elif end and not start and days is None:
                # Default to 3-day itinerary ending on end_date
                data["days"] = 3
                data["start_date"] = end - timedelta(days=2)
            elif days is not None and not start and not end:
                today = date.today()
                data["start_date"] = today
                data["end_date"] = today + timedelta(days=days - 1)
            elif days is None and not start and not end:
                raise ValueError("Must provide either travel dates or number of days.")
        return data

# --- CORE DATA (The places we can choose from) ---

class ViewpointRecommendation(BaseModel):
    viewpoint_name: str
    name: Optional[str] = None
    description: str
    best_moment: Optional[str] = None
    pro_tip: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_name_fields(cls, data):
        if isinstance(data, dict):
            v_name = data.get("viewpoint_name") or data.get("name")
            if v_name:
                data["viewpoint_name"] = v_name
                data["name"] = v_name
        return data

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
    
    # Data Provenance & Verification
    verification_status: str = Field(default="curated_seed", description="Data verification status: 'curated_seed', 'verified', 'estimated'")
    last_verified_date: Optional[str] = Field(default="2026-09-01", description="Last date ticket rates and hours were audited")
    source_reference: Optional[str] = Field(default="Curated City Seed Dataset", description="Source of opening hours and fees")
    
    # Hotel specific fields
    price_per_night_inr: Optional[int] = Field(None, ge=0)
    max_guests_per_room: int = Field(default=2, ge=1, le=10)
    data_source: Optional[str] = Field(None, description="Data provenance note")
    
    # Experience Intelligence
    golden_hour_recommended: bool = False
    night_view_recommended: bool = False
    best_viewpoints: List[ViewpointRecommendation] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list, description="IDs or names of prerequisite activities that must precede this stop")


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

class WeatherSummary(BaseModel):
    condition: str = Field(default="Clear", description="Dominant weather condition: Clear, Partly Cloudy, Rain, etc.")
    max_temp_c: float = Field(default=30.0, description="Forecast peak temperature in Celsius")
    precipitation_probability_pct: int = Field(default=0, description="Probability of rain (0-100%)")
    heat_advisory: bool = Field(default=False, description="True if temp > 38C or intense sun warning")
    advisory_text: str = Field(default="Pleasant outdoor exploration conditions.", description="Actionable traveler weather guidance")
    is_forecast: bool = Field(default=True, description="True if live forecast from Open-Meteo, False if climatological heuristic")

class ExclusionReason(BaseModel):
    place_name: str
    category: str = Field(..., description="Category: 'closed_on_day', 'budget_limit', 'pace_limit', 'operating_hours', 'geographic_detour'")
    reason: str = Field(..., description="Human-readable explanation of why this attraction was omitted")
    suggested_action: Optional[str] = Field(None, description="Actionable suggestion to include this place")

class DecisionTrace(BaseModel):
    hotel_rationale: str
    pacing_rationale: str
    weather_rationale: Optional[str] = None
    group_profile_rationale: Optional[str] = None
    excluded_places: List[ExclusionReason] = Field(default_factory=list, description="Why not X: Reasons why candidate places were excluded")

class ExpenseBreakdown(BaseModel):
    lodging_inr: int = 0
    transit_inr: int = 0
    activities_inr: int = 0
    dining_inr: int = 0
    direct_subtotal_inr: int = 0
    unallocated_buffer_inr: int = 0
    suggested_meals_inr: int = 0
    additional_meals_inr: int = 0
    budget_limit_inr: int = 0
    meal_buffer_status: str = Field(default="Sufficient", description="Status comparing buffer against estimated meal needs")

    # Backwards-compatibility aliases
    buffer_inr: int = 0
    estimated_meals_inr: int = 0
    total_inr: int = 0
    per_person_inr: int = 0

class ScheduledActivity(BaseModel):
    place_id: Optional[str] = None
    place_name: str
    place_type: str = Field(default="attraction", description="'attraction' or 'restaurant'")
    lat: float = Field(default=0.0, description="Activity latitude for map pin")
    lng: float = Field(default=0.0, description="Activity longitude for map pin")
    start_time: str
    end_time: str
    estimated_cost_inr: int
    is_locked: bool = Field(default=False, description="True if pinned/locked by user")
    experience_tag: Optional[str] = None
    recommended_viewpoint: Optional[ViewpointRecommendation] = None
    verification_status: Optional[str] = Field(default="curated_seed", description="Data provenance status")
    last_verified_date: Optional[str] = Field(default="2026-09-01", description="Last date ticket rates and hours were audited")
    source_reference: Optional[str] = Field(default="Curated City Seed Dataset", description="Source of opening hours and fees")
    crowd_forecast: Optional[CrowdForecast] = Field(default=None, description="Heuristic crowd forecast for this scheduled time window")
    depends_on: List[str] = Field(default_factory=list, description="Prerequisite activities that must precede this stop")
    detour_cost_inr: Optional[float] = Field(default=None, description="Detour cost in INR for dining insertion")


class DayPlan(BaseModel):
    day_number: int
    date: Optional[str] = None           # e.g. "2026-10-16"
    day_of_week: Optional[str] = None    # e.g. "Friday"
    cluster_name: Optional[str] = None   # e.g. "Historic Heritage Hub"
    activities: List[ScheduledActivity]
    day_cost_inr: int
    fatigue_score: Optional[int] = Field(None, description="Physical exertion index (0-100)")
    fatigue_level: Optional[str] = Field(None, description="Pacing description e.g. Gentle Pace, Moderate, High Exertion")
    weather: Optional[WeatherSummary] = Field(None, description="Day weather forecast and advisory")

class VerificationReport(BaseModel):
    is_valid: bool = Field(default=True, description="True if all hard physics, time-window, and budget constraints hold")
    audit_score: int = Field(default=100, ge=0, le=100, description="Confidence score out of 100 based on validation checks")
    checks_passed: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    metrics: Dict[str, str] = Field(default_factory=dict, description="Operational physics metrics")

class TripPlan(BaseModel):
    plan_name: str
    variant_type: PlanVariantType = PlanVariantType.BALANCED
    hotel_summary: Optional[HotelStaySummary] = None
    estimated_transport_cost_inr: int = 0
    transport_mode: TransportMode
    transport_budget_status: str = Field(default="Within budget", description="Status of transport spend relative to user cap")
    days: List[DayPlan]
    total_cost_inr: int
    verification_report: Optional[VerificationReport] = Field(default=None, description="Independent verification and physics audit")
    fatigue_report: Optional[Dict[str, Any]] = Field(default=None, description="Physical exertion and pace report")
    decision_trace: Optional[DecisionTrace] = Field(default=None, description="Why this hotel and why not X explainability trace")
    expense_breakdown: Optional[ExpenseBreakdown] = Field(default=None, description="Category-wise budget breakdown and simulator")
    intercity_transport: Optional[InterCityTransportSummary] = Field(default=None, description="Curated inter-city transit options & depot-to-hotel last mile connection")
    disclaimer: str = Field(
        default="Estimated local subtotal. Excludes intercity transit, lodging taxes/GST, and unmodeled expenses.",
        description="Cost transparency disclaimer"
    )

class MultiVariantTripPlan(BaseModel):
    destination: str
    origin_city: Optional[str] = None
    travel_dates: str
    synthesis_stages: List[Dict[str, Any]] = Field(default_factory=list, description="Telemetry describing the 10 executed blueprint optimization stages")
    variants: Dict[str, TripPlan] = Field(..., description="The 3 diverse plan variants: budget, balanced, comfort")

# --- INTERACTIVE ITINERARY CUSTOMIZER & EDIT CONSEQUENCE MODELS ---

class EditActionType(str, Enum):
    SWAP = "swap"
    REMOVE = "remove"
    PIN = "pin"
    MOVE_TO_SUNSET = "move_to_sunset"

class EditConsequenceRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    destination: str
    plan: TripPlan
    day_number: int
    activity_index: int
    action: EditActionType
    replacement_place_id: Optional[str] = None
    people_count: int = Field(default=1, gt=0)
    transport_mode: TransportMode = Field(default=TransportMode.CAB)

class EditConsequenceResponse(BaseModel):
    is_feasible: bool
    action: EditActionType
    target_activity_name: str
    replacement_activity_name: Optional[str] = None
    delta_cost_inr: int
    delta_transit_km: float
    delta_transit_minutes: int
    delta_duration_minutes: int
    feasibility_notes: List[str] = Field(default_factory=list)
    impact_summary: str
    suggested_updated_day: Optional[DayPlan] = None
