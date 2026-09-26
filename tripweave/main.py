import os
import json
from typing import List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from tripweave.models import (
    TripRequest, TripPlan, Place, MultiVariantTripPlan, 
    PlanVariantType, PacePreference, TransportPreference, 
    TransportMode, HotelPreference
)
from tripweave.feasibility import FeasibilityFilter
from tripweave.optimizer import TripOptimizer

# 1. Initialize FastAPI Application
app = FastAPI(
    title="TripWeave Optimization Engine API",
    description="Deterministic travel itinerary optimization engine powered by Google OR-Tools and Feasibility Filtering.",
    version="1.0.0"
)

# 2. Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_CITIES = {"hyderabad", "delhi", "jaipur"}

def get_database_places(destination: str = "hyderabad") -> List[Place]:
    """Loads curated seed places for the target launch city."""
    city_key = destination.strip().lower()
    if city_key not in SUPPORTED_CITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Destination '{destination}' is not supported in Phase 0. Supported launch cities: {', '.join(c.capitalize() for c in sorted(SUPPORTED_CITIES))}."
        )
        
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, 'data', f'{city_key}_mock.json')
    
    if not os.path.exists(data_path):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database file for {destination} is missing on server."
        )
        
    with open(data_path, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
    
    return [Place(**item) for item in raw_data]

def _build_single_plan(request: TripRequest, variant: PlanVariantType = PlanVariantType.BALANCED) -> TripPlan:
    """Internal pipeline helper executing Stages 1-8 for a specific variant."""
    # 1. Load city places
    all_places = get_database_places(request.destination)
    
    # 2. Feasibility Filter & Hotel Selection
    filter_engine = FeasibilityFilter()
    try:
        valid_places, hotel_summary, transport_reserve = filter_engine.filter_candidates(all_places, request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Feasibility conflict: {str(e)}"
        )
        
    # 3. Add 'Why this hotel?' explanation (Engineering Blueprint Stage 10)
    if hotel_summary.nights > 0:
        hotel_summary.why_this_hotel = (
            f"Selected {hotel_summary.hotel_name} (₹{hotel_summary.price_per_night_per_room}/room/night) "
            f"because its centroid proximity minimizes daily commute to attractions "
            f"while comfortably fulfilling your {hotel_summary.people_accommodated}-guest room requirement."
        )

    # 4. Resolve routing depot
    selected_hotel = next(
        (p for p in valid_places if p.place_id == hotel_summary.hotel_id), 
        None
    )
    if not selected_hotel:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error: Selected hotel could not be resolved as route depot."
        )
        
    # 5. OR-Tools Optimization with Date/Day-of-Week Closures
    optimizer = TripOptimizer(
        places=valid_places,
        days=request.days,
        hotel_id=selected_hotel.place_id,
        hotel_summary=hotel_summary,
        transport_mode=request.transport_pref.mode if request.transport_pref else TransportMode.CAB,
        people_count=request.people_count,
        pace=request.pace,
        interests=request.interests,
        max_total_budget=request.budget_inr,
        max_transport_budget=request.transport_pref.max_budget_inr if request.transport_pref else None,
        start_date=request.start_date,
        variant_type=variant
    )
    
    try:
        itinerary = optimizer.generate_plan()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Optimization failed: {str(e)}"
        )

    # 6. Post-Optimization Budget Guardrail
    if itinerary.total_cost_inr > request.budget_inr:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Feasibility conflict: Final plan total (₹{itinerary.total_cost_inr}) exceeded budget (₹{request.budget_inr}). Consider choosing a more economical transport mode or increasing budget."
        )

    return itinerary

# --- REST ENDPOINTS ---

@app.get("/", tags=["General"])
def root():
    return {
        "service": "TripWeave Engine API",
        "status": "online",
        "documentation": "/docs",
        "supported_cities": [c.capitalize() for c in sorted(SUPPORTED_CITIES)]
    }

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "service": "tripweave-engine"}

@app.get("/api/places", response_model=List[Place], tags=["Places Database"])
def list_places(destination: str = "hyderabad"):
    """Returns curated seed places and hotels for a supported destination."""
    return get_database_places(destination)

@app.post("/api/itinerary/generate", response_model=TripPlan, tags=["Itinerary Generation"])
def generate_itinerary(request: TripRequest):
    """
    Generates a single optimal itinerary based on user constraints.
    Enforces opening hours, day-of-week closures, golden hour, and budget limits.
    """
    return _build_single_plan(request, variant=PlanVariantType.BALANCED)

@app.post("/api/itinerary/generate-variants", response_model=MultiVariantTripPlan, tags=["Itinerary Generation"])
def generate_variants(request: TripRequest):
    """
    Blueprint Stage 9: Generates 3 Diverse Plan Variants:
    1. Budget / Relaxed: Slower pace (2 places/day), lower expense.
    2. Balanced: Optimal trade-off with iconic golden-hour highlights.
    3. Comfort: Intensive pace (4 places/day) with cab transit.
    """
    # 1. Budget Variant (Relaxed pace, Auto transit, smart budget stay)
    budget_req = request.model_copy(deep=True)
    budget_req.pace = PacePreference.RELAXED
    budget_req.transport_pref = TransportPreference(mode=TransportMode.AUTO)
    if not budget_req.hotel_pref:
        budget_req.hotel_pref = HotelPreference(max_price_per_night_inr=1800)
    try:
        plan_budget = _build_single_plan(budget_req, variant=PlanVariantType.BUDGET)
    except Exception:
        budget_req.hotel_pref = request.hotel_pref
        plan_budget = _build_single_plan(budget_req, variant=PlanVariantType.BUDGET)

    # 2. Balanced Variant (User default)
    plan_balanced = _build_single_plan(request, variant=PlanVariantType.BALANCED)

    # 3. Comfort Variant (Intensive pace, Cab transit, upgraded boutique lodging)
    comfort_req = request.model_copy(deep=True)
    comfort_req.pace = PacePreference.INTENSIVE
    comfort_req.transport_pref = TransportPreference(mode=TransportMode.CAB)
    if not comfort_req.hotel_pref:
        comfort_req.hotel_pref = HotelPreference(min_price_per_night_inr=2200)
    try:
        plan_comfort = _build_single_plan(comfort_req, variant=PlanVariantType.COMFORT)
    except Exception:
        comfort_req.hotel_pref = request.hotel_pref
        plan_comfort = _build_single_plan(comfort_req, variant=PlanVariantType.COMFORT)

    travel_dates_str = f"{request.start_date.isoformat()} to {request.end_date.isoformat()}" if request.start_date and request.end_date else f"{request.days} Days"

    return MultiVariantTripPlan(
        destination=request.destination.capitalize(),
        travel_dates=travel_dates_str,
        variants={
            "budget": plan_budget,
            "balanced": plan_balanced,
            "comfort": plan_comfort
        }
    )
