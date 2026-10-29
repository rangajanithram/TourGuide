from enum import Enum
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any, Literal
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

class ConfirmedDiscoveryStop(BaseModel):
    model_config = ConfigDict(extra="forbid")
    place_id: str = Field(min_length=1, max_length=512)
    name: str = Field(min_length=1, max_length=250)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    place_type: Literal["attraction", "restaurant"] = "attraction"
    duration_minutes: int = Field(ge=15, le=480)
    estimated_cost_per_person_inr: int = Field(ge=0, le=100000)
    open_time_mins: int = Field(ge=0, le=720)
    close_time_mins: int = Field(ge=0, le=720)
    rating: Optional[float] = Field(default=None, ge=0.0, le=5.0)
    review_count: Optional[int] = Field(default=None, ge=0)
    formatted_address: Optional[str] = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def check_window(self):
        if self.close_time_mins - self.open_time_mins < self.duration_minutes:
            raise ValueError("The confirmed time window must fit the visit duration.")
        return self

class JourneyTiming(BaseModel):
    """User-supplied Indian travel times, not verified transport inventory."""
    model_config = ConfigDict(extra="forbid")
    version: Literal[1] = 1
    timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"
    outbound_departure: datetime
    destination_arrival: datetime
    destination_departure: datetime
    return_arrival: datetime
    arrival_transfer_minutes: int = Field(default=0, ge=0, le=720, strict=True)
    departure_transfer_minutes: int = Field(default=0, ge=0, le=720, strict=True)
    arrival_transfer_cost_inr: Optional[int] = Field(default=None, ge=0, le=500_000, strict=True)
    arrival_transfer_paid_inr: Optional[int] = Field(default=None, ge=0, le=500_000, strict=True)
    departure_transfer_cost_inr: Optional[int] = Field(default=None, ge=0, le=500_000, strict=True)
    departure_transfer_paid_inr: Optional[int] = Field(default=None, ge=0, le=500_000, strict=True)
    arrival_buffer_minutes: int = Field(ge=0, le=720)
    departure_buffer_minutes: int = Field(ge=0, le=720)

    @field_validator("outbound_departure", "destination_arrival", "destination_departure", "return_arrival")
    @classmethod
    def require_indian_offset(cls, value):
        if value.utcoffset() != timedelta(hours=5, minutes=30) or value.second or value.microsecond:
            raise ValueError("Travel times must use minute precision and the +05:30 India offset.")
        return value

    @model_validator(mode="after")
    def chronological(self):
        if not self.outbound_departure < self.destination_arrival < self.destination_departure < self.return_arrival:
            raise ValueError("Travel times must follow departure, destination arrival, destination departure, then return arrival.")
        if self.return_arrival - self.outbound_departure > timedelta(days=30):
            raise ValueError("Travel timing can cover at most 30 days.")
        if self.arrival_transfer_cost_inr is None:
            if self.arrival_transfer_paid_inr is not None and self.arrival_transfer_paid_inr > 0:
                raise ValueError("Paid arrival transfer amount requires an arrival transfer cost estimate.")
        elif self.arrival_transfer_paid_inr is not None:
            if self.arrival_transfer_paid_inr > self.arrival_transfer_cost_inr:
                raise ValueError("Paid arrival transfer amount cannot exceed the whole-group arrival transfer fare.")
        if self.departure_transfer_cost_inr is None:
            if self.departure_transfer_paid_inr is not None and self.departure_transfer_paid_inr > 0:
                raise ValueError("Paid departure transfer amount requires a departure transfer cost estimate.")
        elif self.departure_transfer_paid_inr is not None:
            if self.departure_transfer_paid_inr > self.departure_transfer_cost_inr:
                raise ValueError("Paid departure transfer amount cannot exceed the whole-group departure transfer fare.")
        return self

    def local_window(self, start: date, end: date, earliest: int, latest: int):
        """Legacy scalar helper; calendar-aware scheduling uses planning_windows."""
        ready = self.destination_arrival + timedelta(minutes=self.arrival_buffer_minutes + self.arrival_transfer_minutes)
        leave = self.destination_departure - timedelta(minutes=self.departure_buffer_minutes + self.departure_transfer_minutes)
        if ready.date() > start or leave.date() < end:
            raise ValueError("Sightseeing dates must fit between arrival plus buffer and departure minus buffer. Adjust dates or travel times.")
        if ready.date() == start:
            earliest = max(earliest, ready.hour * 60 + ready.minute - 480)
        if leave.date() == end:
            latest = min(latest, leave.hour * 60 + leave.minute - 480)
        if earliest >= 720 or latest <= 0 or (start == end and earliest >= latest):
            raise ValueError("Travel timing leaves no sightseeing time in the 08:00–20:00 planning window.")
        return earliest, latest


class StayChoice(BaseModel):
    """User-confirmed daily base and whole-group stay cost; never a hotel quote."""
    model_config = ConfigDict(extra="forbid")
    version: Literal[1] = 1
    kind: Literal["booked", "family_friends", "no_stay"]
    base_name: str = Field(min_length=1, max_length=160)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    total_stay_cost_inr: int = Field(default=0, ge=0, le=5_000_000)
    budget_treatment: Literal["include", "already_paid"] = "include"
    check_in_time: Optional[str] = Field(default=None, max_length=16)
    check_out_time: Optional[str] = Field(default=None, max_length=16)
    check_in_date: Optional[date] = None
    check_out_date: Optional[date] = None
    check_in_buffer_minutes: int = Field(default=0, ge=0, le=180, strict=True)
    check_out_buffer_minutes: int = Field(default=0, ge=0, le=180, strict=True)
    constrain_sightseeing_to_stay: bool = Field(default=False, strict=True)
    allows_bag_drop: Optional[bool] = Field(default=None, strict=True)

    @model_validator(mode='after')
    def dated_stay(self):
        if bool(self.check_in_date) != bool(self.check_out_date):
            raise ValueError('Enter both check-in and check-out dates, or leave both blank.')
        if self.check_in_date and (self.kind != 'booked' or self.check_out_date < self.check_in_date or (self.check_out_date - self.check_in_date).days > 30):
            raise ValueError('Booked stay dates must be in order and span at most 30 nights.')
        return self

    @field_validator("check_in_time", "check_out_time")
    @classmethod
    def validate_stay_time(cls, value):
        if value is not None:
            v = value.strip()
            parts = v.split(":")
            if len(parts) != 2 or not all(p.isdigit() for p in parts):
                raise ValueError("Stay time must be in HH:MM format.")
            h, m = int(parts[0]), int(parts[1])
            if not (0 <= h <= 23 and 0 <= m <= 59):
                raise ValueError("Stay time must be a valid 24-hour time.")
            return f"{h:02d}:{m:02d}"
        return value

    def sightseeing_window(self, days, earliest, latest):
        """Legacy scalar helper; dated stays use planning_windows."""
        if not self.constrain_sightseeing_to_stay:
            return earliest, latest
        if self.kind != "booked" or not self.check_in_time or not self.check_out_time:
            raise ValueError("Stay scheduling requires a booked stay and confirmed check-in and check-out times.")
        minute = lambda value: int(value[:2]) * 60 + int(value[3:]) - 480
        earliest = max(earliest, minute(self.check_in_time))
        latest = min(latest, minute(self.check_out_time))
        if earliest >= 720 or latest <= 0 or (days == 1 and earliest >= latest):
            raise ValueError("Stay times leave no sightseeing window. Adjust dates or disable the stay constraint after arranging luggage storage.")
        return earliest, latest

    @field_validator("base_name")
    @classmethod
    def clean_base_name(cls, value):
        if not value.strip():
            raise ValueError("Enter a name for the daily starting location.")
        return value.strip()

    @model_validator(mode="after")
    def check_cost_scope(self):
        if self.kind != "booked" and (self.total_stay_cost_inr or self.budget_treatment != "include"):
            raise ValueError("Only booked stays can have a lodging cost or prepaid budget treatment.")
        return self


class BookedTransport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1] = 1
    outbound_mode: Literal["train", "bus", "flight"]
    return_mode: Literal["train", "bus", "flight"]
    total_fare_inr: int = Field(..., ge=0, le=5_000_000, strict=True)
    paid_inr: int = Field(..., ge=0, le=5_000_000, strict=True)

    @model_validator(mode="after")
    def check_paid_amount(self):
        if self.paid_inr > self.total_fare_inr:
            raise ValueError("Paid transport amount cannot exceed the whole-group roundtrip fare.")
        return self


class DiscoveryPlanningPolicy(BaseModel):
    """Explicit user assumptions for otherwise unknown venue planning facts."""
    model_config = ConfigDict(extra="forbid")
    visit_minutes: int = Field(default=90, ge=30, le=240)
    attraction_cost_inr: int = Field(default=200, ge=0, le=10000)
    meal_cost_inr: int = Field(default=200, ge=0, le=10000)
    open_time_mins: int = Field(default=60, ge=0, le=600)
    close_time_mins: int = Field(default=720, ge=120, le=720)

    @model_validator(mode="after")
    def fits_visit(self):
        if self.close_time_mins - self.open_time_mins < self.visit_minutes:
            raise ValueError("Your discovery planning window must fit the visit duration.")
        return self


class PlanningPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    availability_version: Literal[1, 2] = 1
    use_road_routes: bool = Field(default=False, strict=True)
    preferred_activities: List[str] = Field(default_factory=list, max_length=15, description="Optional shortlisted catalog stops; never a feasibility requirement")
    whole_journey_budget_inr: Optional[int] = Field(default=None, gt=0, le=5_000_000, strict=True)
    booked_transport: Optional[BookedTransport] = None
    intercity_modes: List[Literal["train", "bus", "flight"]] = Field(default_factory=lambda: ["train", "bus", "flight"], min_length=1, max_length=3)
    stay_choice: Optional[StayChoice] = None
    journey_timing: Optional[JourneyTiming] = None
    meal_budget_per_person: Optional[int] = Field(default=None, ge=0, le=10000)
    arrival_available_mins: int = Field(default=60, ge=0, le=720)
    departure_deadline_mins: int = Field(default=720, ge=0, le=720)
    external_stops: List[ConfirmedDiscoveryStop] = Field(default_factory=list, max_length=15)
    max_visit_minutes: Optional[int] = Field(None, ge=30, le=480)
    avoid_climbing: bool = False
    food_preference: Literal["any", "vegetarian", "vegan", "halal", "own_meals"] = "any"
    discovery_policy: Optional[DiscoveryPlanningPolicy] = None

class TripRequest(PlanningPreferences):
    model_config = ConfigDict(extra="forbid")
    @property
    def destination_budget_available(self) -> int:
        if self.whole_journey_budget_inr is None:
            return self.budget_inr
        tickets = self.booked_transport.total_fare_inr if self.booked_transport else 0
        prepaid = self.stay_choice.total_stay_cost_inr if self.stay_choice and self.stay_choice.budget_treatment == "already_paid" else 0
        transfers = ((self.journey_timing.arrival_transfer_cost_inr or 0) + (self.journey_timing.departure_transfer_cost_inr or 0)) if self.journey_timing else 0
        return min(self.budget_inr, self.whole_journey_budget_inr - tickets - prepaid - transfers)

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

    @model_validator(mode="after")
    def apply_journey_timing(self):
        if self.whole_journey_budget_inr is not None:
            if self.origin_city and self.origin_city.strip().lower() != self.destination.strip().lower() and not self.booked_transport:
                raise ValueError("Book and enter both travel fares before setting a combined journey cost cap.")
            if self.destination_budget_available <= 0:
                raise ValueError("Tickets, transfers and prepaid stay leave no destination budget. Increase the combined cap or reduce confirmed costs.")
        if self.booked_transport and not self.journey_timing:
            raise ValueError("Booked transport requires your outbound and return travel timing.")
        if self.journey_timing:
            if not self.origin_city or self.origin_city.strip().lower() == self.destination.strip().lower():
                raise ValueError("Choose a different origin city to add intercity travel timing.")
        from tripweave.availability import planning_windows
        windows = planning_windows(self)
        # Preserve the historical boundary fields for ordinary partial days.
        # Fully unavailable travel days use the explicit per-date windows.
        if windows[0]['end'] > windows[0]['start']:
            self.arrival_available_mins = windows[0]['start']
        if windows[-1]['end'] > windows[-1]['start']:
            self.departure_deadline_mins = windows[-1]['end']
        return self

    @model_validator(mode="before")
    @classmethod
    def resolve_dates_and_days(cls, data):
        if isinstance(data, dict):
            # 1. Map top-level transport_mode to transport_pref if not already set
            if data.get("transport_mode") is not None and not data.get("transport_pref"):
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
    visit_parent_id: Optional[str] = Field(default=None, max_length=523)
    visit_part: Optional[Literal['before_lunch', 'after_lunch']] = None
    featured: bool = False
    search_aliases: List[str] = Field(default_factory=list, max_length=12)
    catalog_reviewed_date: Optional[str] = None
    planning_window_estimated: bool = False
    rating_evidence: Optional[str] = Field(default=None, max_length=280)
    meal_venue_id: Optional[str] = None
    planning_day: Optional[int] = Field(default=None, ge=0, le=13)
    meal_type: Optional[Literal["breakfast", "lunch", "dinner"]] = None
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
    
    source_urls: List[str] = Field(default_factory=list, max_length=10)
    catalog_origin: str = "curated_seed"

    # Hotel specific fields
    price_per_night_inr: Optional[int] = Field(None, ge=0)
    max_guests_per_room: int = Field(default=2, ge=1, le=10)
    data_source: Optional[str] = Field(None, description="Data provenance note")
    check_in_time: Optional[str] = Field(default=None, max_length=16)
    check_out_time: Optional[str] = Field(default=None, max_length=16)
    rating: Optional[float] = Field(default=None, ge=0.0, le=5.0)
    review_count: Optional[int] = Field(default=None, ge=0)
    formatted_address: Optional[str] = Field(default=None, max_length=300)
    osm_url: Optional[str] = Field(default=None, max_length=500)
    
    # Optional evidence: unknown is not a claim of accessibility or dietary suitability.
    requires_climbing: Optional[bool] = None
    dietary_options: List[Literal["vegetarian", "vegan", "halal"]] = Field(default_factory=list)

    # Experience Intelligence
    golden_hour_recommended: bool = False
    night_view_recommended: bool = False
    best_viewpoints: List[ViewpointRecommendation] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list, description="IDs or names of prerequisite activities that must precede this stop")


# --- OUTPUT ITINERARY (What the engine produces) ---

class HotelStaySummary(BaseModel):
    check_in_date: Optional[date] = None
    check_out_date: Optional[date] = None
    accommodation_kind: Literal["planner_selected", "booked", "family_friends", "no_stay"] = "planner_selected"
    reported_stay_total_inr: Optional[int] = Field(default=None, ge=0, le=5_000_000)
    excluded_prepaid_cost_inr: int = Field(default=0, ge=0, le=5_000_000)
    hotel_id: str = Field(default="", max_length=120, description="Unique ID of the hotel or day-trip depot")
    hotel_name: str = Field(..., min_length=1, max_length=200)
    lat: float = Field(default=0.0, ge=-90.0, le=90.0, description="Hotel latitude for map pin")
    lng: float = Field(default=0.0, ge=-180.0, le=180.0, description="Hotel longitude for map pin")
    price_per_night_per_room: int = Field(..., ge=0, le=1_000_000)
    rooms_needed: int = Field(..., ge=0, le=50)
    nights: int = Field(..., ge=0, le=30)
    people_accommodated: int = Field(..., ge=1, le=50)
    total_cost_inr: int = Field(..., ge=0, le=5_000_000)
    provenance: str = Field(..., max_length=500, description="Clear provenance note of the rate")
    why_this_hotel: Optional[str] = Field(None, max_length=1000, description="Decision trace explaining why this hotel was selected")
    check_in_time: Optional[str] = Field(default=None, max_length=16)
    check_out_time: Optional[str] = Field(default=None, max_length=16)
    rating: Optional[float] = Field(default=None, ge=0.0, le=5.0)
    review_count: Optional[int] = Field(default=None, ge=0)
    formatted_address: Optional[str] = Field(default=None, max_length=300)
    osm_url: Optional[str] = Field(default=None, max_length=500)

class WeatherSummary(BaseModel):
    condition: str = Field(default="Clear", description="Dominant weather condition: Clear, Partly Cloudy, Rain, etc.")
    max_temp_c: float = Field(default=30.0, description="Forecast peak temperature in Celsius")
    precipitation_probability_pct: int = Field(default=0, description="Probability of rain (0-100%)")
    heat_advisory: bool = Field(default=False, description="True if temp > 38C or intense sun warning")
    advisory_text: str = Field(default="Pleasant outdoor exploration conditions.", description="Actionable traveler weather guidance")
    is_forecast: bool = Field(default=True, description="True if live forecast from Open-Meteo, False if climatological heuristic")

class ExclusionReason(BaseModel):
    place_name: str
    category: str = Field(..., description="Planning hint: closed_on_day, budget_limit, pace_limit, operating_hours, geographic_detour, route_choice, meal_choice or preference")
    reason: str = Field(..., description="Evidence-based hint; not proof that no alternative itinerary could include this place")
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
    travel_minutes_from_previous: Optional[int] = Field(default=None, ge=0, le=1440)
    free_minutes_before: Optional[int] = Field(default=None, ge=0, le=1440)
    visit_parent_id: Optional[str] = Field(default=None, max_length=523)
    visit_part: Optional[Literal['before_lunch', 'after_lunch']] = None
    meal_venue_id: Optional[str] = None
    rating_evidence: Optional[str] = Field(default=None, max_length=280)
    meal_type: Optional[Literal["breakfast", "lunch", "dinner"]] = None
    place_id: Optional[str] = Field(default=None, max_length=523)
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
    rating: Optional[float] = Field(default=None, ge=0.0, le=5.0)
    review_count: Optional[int] = Field(default=None, ge=0)
    formatted_address: Optional[str] = Field(default=None, max_length=300)
    osm_url: Optional[str] = Field(default=None, max_length=500)


class DayPlan(BaseModel):
    planning_note: Optional[str] = Field(default=None, max_length=500)
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
    visit_continuations: List[Place] = Field(default_factory=list, max_length=14)
    routing_summary: Dict[str, Any] = Field(default_factory=dict)
    journey_notes: List[str] = Field(default_factory=list, max_length=12)
    candidate_summary: Dict[str, Any] = Field(default_factory=dict)
    meal_places: List[Place] = Field(default_factory=list, max_length=42)
    planning_preferences: PlanningPreferences = Field(default_factory=PlanningPreferences)
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
    booked_transport: Optional[BookedTransport] = None
    intercity_notice: Optional[str] = None
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
    replacement_place_id: Optional[str] = Field(default=None, max_length=523)
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
