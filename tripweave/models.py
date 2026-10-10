from enum import Enum
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, model_validator, field_validator, ConfigDict
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
    origin_city: Optional[str] = Field(None, max_length=80, description="Optional departure city for inter-city travel recommendations (e.g. 'Bengaluru', 'Mumbai', 'Delhi')")
    destination: str = Field(..., min_length=2, max_length=80, description="Target city (e.g. 'Hyderabad', 'Delhi', 'Jaipur')")
    start_date: Optional[date] = Field(None, description="Trip start date (YYYY-MM-DD)")
    end_date: Optional[date] = Field(None, description="Trip end date (YYYY-MM-DD)")
    days: Optional[int] = Field(None, gt=0, le=14, description="Trip duration in days (auto-computed if dates provided)")
    budget_inr: int = Field(
        ...,
        gt=0,
        le=5_000_000,
        description="Total on-ground destination budget in INR for the entire group (covers lodging, local city transit, attraction entry fees, and scheduled itinerary dining; excludes intercity travel, lodging taxes/GST, and unscheduled personal expenses)"
    )
    people_count: int = Field(..., gt=0, le=20, description="Number of travelers (1 to 20)")
    interests: List[str] = Field(default_factory=list, max_length=20, description="User tags/interests (e.g. ['history', 'food'])")
    pace: PacePreference = Field(default=PacePreference.BALANCED, description="Trip intensity/pace")
    start_location: Optional[str] = Field(None, max_length=160, description="Optional starting hub for day trips (e.g. 'Secunderabad Railway Station')")
    origin_type: Optional[str] = Field("hotel", max_length=40, description="Trip starting origin type: 'hotel', 'station', 'airport', 'custom'")
    transport_mode: Optional[TransportMode] = Field(None, description="Primary transport mode shorthand")
    group_profile: GroupProfile = Field(default=GroupProfile.DEFAULT, description="Traveler group profile for calibrated pacing & fatigue")
    locked_activities: List[str] = Field(default_factory=list, max_length=15, description="User-pinned activities that must be included")
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
    hotel_id: str = Field(default="", max_length=120, description="Unique ID of the hotel or day-trip depot")
    hotel_name: str = Field(..., min_length=1, max_length=200)
    lat: float = Field(default=0.0, ge=-90.0, le=90.0, description="Hotel latitude for map pin")
    lng: float = Field(default=0.0, ge=-180.0, le=180.0, description="Hotel longitude for map pin")
    price_per_night_per_room: int = Field(..., ge=0, le=1_000_000)
    rooms_needed: int = Field(..., ge=0, le=50)
    nights: int = Field(..., ge=0, le=14)
    people_accommodated: int = Field(..., ge=1, le=50)
    total_cost_inr: int = Field(..., ge=0, le=5_000_000)
    provenance: str = Field(..., max_length=500, description="Clear provenance note of the rate")
    why_this_hotel: Optional[str] = Field(None, max_length=1000, description="Decision trace explaining why this hotel was selected")

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
    lodging_inr: int = Field(default=0, ge=0, le=5_000_000)
    transit_inr: int = Field(default=0, ge=0, le=5_000_000)
    activities_inr: int = Field(default=0, ge=0, le=5_000_000)
    dining_inr: int = Field(default=0, ge=0, le=5_000_000)
    direct_subtotal_inr: int = Field(default=0, ge=0, le=10_000_000)
    unallocated_buffer_inr: int = Field(default=0, ge=0, le=10_000_000)
    suggested_meals_inr: int = Field(default=0, ge=0, le=5_000_000)
    additional_meals_inr: int = Field(default=0, ge=0, le=5_000_000)
    budget_limit_inr: int = Field(default=0, ge=0, le=10_000_000)
    meal_buffer_status: str = Field(default="Sufficient", description="Status comparing buffer against estimated meal needs")

    # Backwards-compatibility aliases
    buffer_inr: int = Field(default=0, ge=0, le=10_000_000)
    estimated_meals_inr: int = Field(default=0, ge=0, le=5_000_000)
    total_inr: int = Field(default=0, ge=0, le=10_000_000)
    per_person_inr: int = Field(default=0, ge=0, le=5_000_000)

class ScheduledActivity(BaseModel):
    place_id: Optional[str] = Field(default=None, max_length=120)
    place_name: str = Field(..., min_length=1, max_length=200)
    place_type: str = Field(default="attraction", max_length=40, description="'attraction' or 'restaurant'")
    lat: float = Field(default=0.0, ge=-90.0, le=90.0, description="Activity latitude for map pin")
    lng: float = Field(default=0.0, ge=-180.0, le=180.0, description="Activity longitude for map pin")
    start_time: str = Field(..., min_length=3, max_length=32)
    end_time: str = Field(..., min_length=3, max_length=32)
    estimated_cost_inr: int = Field(..., ge=0, le=5_000_000)
    is_locked: bool = Field(default=False, description="True if pinned/locked by user")
    experience_tag: Optional[str] = Field(default=None, max_length=160)
    recommended_viewpoint: Optional[ViewpointRecommendation] = None
    verification_status: Optional[str] = Field(default="curated_seed", max_length=60, description="Data provenance status")
    last_verified_date: Optional[str] = Field(default="2026-09-01", max_length=32, description="Last date ticket rates and hours were audited")
    source_reference: Optional[str] = Field(default="Curated City Seed Dataset", max_length=280, description="Source of opening hours and fees")
    crowd_forecast: Optional[CrowdForecast] = Field(default=None, description="Heuristic crowd forecast for this scheduled time window")
    depends_on: List[str] = Field(default_factory=list, max_length=10, description="Prerequisite activities that must precede this stop")
    detour_cost_inr: Optional[float] = Field(default=None, description="Detour cost in INR for dining insertion")


class DayPlan(BaseModel):
    day_number: int = Field(..., ge=1, le=14)
    date: Optional[str] = Field(default=None, max_length=32)           # e.g. "2026-10-16"
    day_of_week: Optional[str] = Field(default=None, max_length=32)    # e.g. "Friday"
    cluster_name: Optional[str] = Field(default=None, max_length=160)  # e.g. "Historic Heritage Hub"
    activities: List[ScheduledActivity] = Field(..., max_length=25)
    day_cost_inr: int = Field(..., ge=0, le=5_000_000)
    fatigue_score: Optional[int] = Field(None, ge=0, le=100, description="Physical exertion index (0-100)")
    fatigue_level: Optional[str] = Field(None, max_length=80, description="Pacing description e.g. Gentle Pace, Moderate, High Exertion")
    weather: Optional[WeatherSummary] = Field(None, description="Day weather forecast and advisory")

class VerificationReport(BaseModel):
    is_valid: bool = Field(default=True, description="True if all hard physics, time-window, and budget constraints hold")
    audit_score: int = Field(default=100, ge=0, le=100, description="Confidence score out of 100 based on validation checks")
    checks_passed: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    metrics: Dict[str, str] = Field(default_factory=dict, description="Operational physics metrics")

class TripPlan(BaseModel):
    plan_name: str = Field(..., min_length=1, max_length=200)
    variant_type: PlanVariantType = PlanVariantType.BALANCED
    hotel_summary: Optional[HotelStaySummary] = None
    estimated_transport_cost_inr: int = Field(default=0, ge=0, le=5_000_000)
    transport_budget_limit_inr: Optional[int] = Field(None, ge=1, le=5_000_000)
    transport_mode: TransportMode
    transport_budget_status: str = Field(default="Within budget", max_length=160, description="Status of transport spend relative to user cap")
    days: List[DayPlan] = Field(..., min_length=1, max_length=14)
    total_cost_inr: int = Field(..., ge=0, le=10_000_000)
    verification_report: Optional[VerificationReport] = Field(default=None, description="Independent verification and physics audit")
    fatigue_report: Optional[Dict[str, Any]] = Field(default=None, description="Physical exertion and pace report")
    decision_trace: Optional[DecisionTrace] = Field(default=None, description="Why this hotel and why not X explainability trace")
    expense_breakdown: Optional[ExpenseBreakdown] = Field(default=None, description="Category-wise budget breakdown and simulator")
    intercity_transport: Optional[InterCityTransportSummary] = Field(default=None, description="Curated inter-city transit options & depot-to-hotel last mile connection")
    disclaimer: str = Field(
        default="Estimated local on-ground subtotal (lodging, local transit, attraction tickets, and scheduled dining). Excludes intercity travel, lodging taxes/GST, and unscheduled personal expenses.",
        max_length=500,
        description="Cost transparency disclaimer"
    )

class MultiVariantTripPlan(BaseModel):
    schema_version: int = Field(default=1, ge=1, le=10, description="Snapshot schema version for saved-trip compatibility")
    destination: str
    origin_city: Optional[str] = None
    travel_dates: str
    synthesis_stages: List[Dict[str, Any]] = Field(default_factory=list, description="Telemetry describing the 10 executed blueprint optimization stages")
    variants: Dict[str, TripPlan] = Field(..., description="Genuinely distinct feasible plan variants (1 to 3 of: budget, balanced, comfort)")
    unavailable_variants: Dict[str, str] = Field(
        default_factory=dict,
        description="Explanations for any variant tiers that were infeasible or identical under the user's constraints"
    )

# --- INTERACTIVE ITINERARY CUSTOMIZER & EDIT CONSEQUENCE MODELS ---

class EditActionType(str, Enum):
    SWAP = "swap"
    REMOVE = "remove"
    PIN = "pin"
    MOVE_TO_SUNSET = "move_to_sunset"

class EditConsequenceRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    destination: str = Field(..., min_length=2, max_length=80)
    plan: TripPlan
    day_number: int = Field(..., ge=1, le=14)
    activity_index: int = Field(..., ge=0, le=25)
    action: EditActionType
    replacement_place_id: Optional[str] = Field(default=None, max_length=120)
    people_count: int = Field(default=1, gt=0, le=20)
    transport_mode: TransportMode = Field(default=TransportMode.CAB)
    pace: PacePreference = Field(default=PacePreference.BALANCED)
    budget_limit_inr: Optional[int] = Field(default=None, gt=0, le=5_000_000)

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
    updated_plan: Optional[TripPlan] = None

# --- LIVE IN-TRIP REBALANCER ("I'M TIRED" MODE) MODELS ---

class TirednessSeverity(str, Enum):
    MILD = "mild"              # Add 30m rest/cafe buffer, relax pace
    MODERATE = "moderate"      # Drop 1 low-priority stop, add 45m rest break, preserve dinner/sunset
    EXHAUSTED = "exhausted"    # Drop all non-essential sightseeing, head back to hotel or straight to dinner

class RebalanceTiredRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    destination: str = Field(..., min_length=2, max_length=80)
    plan: TripPlan
    day_number: int = Field(..., ge=1)
    current_time_str: str = Field(default="14:30")
    # -1 means no itinerary stop is completed; otherwise this is the index of
    # the current or most recently completed stop in the selected day.
    current_activity_index: Optional[int] = Field(None, ge=-1)
    current_location_lat: Optional[float] = Field(None, ge=-90, le=90)
    current_location_lng: Optional[float] = Field(None, ge=-180, le=180)
    tiredness_level: TirednessSeverity = Field(default=TirednessSeverity.MODERATE)
    people_count: int = Field(default=2, gt=0, le=20)
    transport_mode: TransportMode = Field(default=TransportMode.CAB)
    pace: PacePreference = Field(default=PacePreference.BALANCED)
    budget_limit_inr: Optional[int] = Field(None, gt=0)

    @field_validator("current_time_str", mode="before")
    @classmethod
    def normalize_current_time(cls, value):
        if not isinstance(value, str):
            raise ValueError("current_time_str must be a time string")
        raw = value.strip().upper()
        for fmt in ("%H:%M", "%I:%M %p"):
            try:
                return datetime.strptime(raw, fmt).strftime("%H:%M")
            except ValueError:
                continue
        raise ValueError("current_time_str must use HH:MM or HH:MM AM/PM format")

    @model_validator(mode="after")
    def validate_location_pair(self):
        if (self.current_location_lat is None) != (self.current_location_lng is None):
            raise ValueError("current_location_lat and current_location_lng must be provided together")
        return self

class RebalanceTiredResponse(BaseModel):
    is_feasible: bool
    original_day: DayPlan
    revised_day: DayPlan
    updated_plan: TripPlan
    dropped_activities: List[str] = Field(default_factory=list)
    inserted_breaks: List[str] = Field(default_factory=list)
    route_distance_delta_km: float = 0.0
    transit_time_delta_minutes: int = 0
    transport_cost_delta_inr: int = 0
    fatigue_change_pct: float = 0.0
    budget_within_limit: Optional[bool] = None
    transport_budget_within_limit: Optional[bool] = None
    feasibility_notes: List[str] = Field(default_factory=list)
    old_fatigue_score: int = 0
    new_fatigue_score: int = 0
    summary_message: str
