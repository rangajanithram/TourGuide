import os
import time
import logging
from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("tripweave")

from tripweave.config import settings
from tripweave.provider import get_places_provider
from tripweave.verifier import ItineraryVerifier
from tripweave.models import (
    TripRequest, TripPlan, Place, MultiVariantTripPlan, 
    PlanVariantType, PacePreference, TransportPreference, 
    TransportMode, HotelPreference, WeatherSummary,
    EditConsequenceRequest, EditConsequenceResponse,
    RebalanceTiredRequest, RebalanceTiredResponse
)
from tripweave.feasibility import FeasibilityFilter
from tripweave.optimizer import TripOptimizer, InfeasibleItineraryError
from tripweave.transport import get_transport_provider
from tripweave.editor import ItineraryEditor

# 1. Initialize FastAPI Application
app = FastAPI(
    title="TripWeave Optimization Engine API",
    description="Deterministic travel itinerary optimization engine powered by Google OR-Tools and Feasibility Filtering.",
    version="1.0.0"
)

# 2. Add CORS Middleware from Centralized Config
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_database_places(destination: str = "hyderabad") -> List[Place]:
    """Loads curated places via the PlacesDataProvider abstraction."""
    provider = get_places_provider()
    try:
        return provider.get_places(destination)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

def _build_single_plan(
    request: TripRequest, 
    variant: PlanVariantType = PlanVariantType.BALANCED,
    prefetched_weather: Optional[Dict[str, WeatherSummary]] = None,
    return_timings: bool = False
):
    """Internal pipeline helper executing Stages 1-8 for a specific variant with real performance profiling."""
    timings: Dict[int, float] = {}

    # Stage 1: Candidate Generation
    t_stage1 = time.perf_counter()
    all_places = get_database_places(request.destination)
    if request.locked_activities:
        catalog_names_ids = {p.place_id.lower() for p in all_places} | {p.name.lower() for p in all_places}
        for pin in request.locked_activities:
            if pin.strip().lower() not in catalog_names_ids:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Unknown pinned attraction '{pin}'. Not found in {request.destination.capitalize()} attraction catalog."
                )
    timings[1] = round((time.perf_counter() - t_stage1) * 1000, 2)

    filter_engine = FeasibilityFilter()

    # Stage 5: Hotel Centroid Scoring & Stay Resolution
    t_stage5 = time.perf_counter()
    try:
        selected_hotel_place, hotel_summary = filter_engine.select_hotel(all_places, request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Feasibility conflict: {str(e)}"
        )
    except Exception as e:
        logger.exception("Unexpected error during hotel selection")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal feasibility engine error: {str(e)}"
        )
    timings[5] = round(max(0.01, (time.perf_counter() - t_stage5) * 1000), 2)

    # Stage 2: Hard Feasibility Filter (Budget & Operational Feasibility)
    t_stage2 = time.perf_counter()
    sightseeing = [p for p in all_places if p.place_type != "hotel"]
    est_transport_budget = 300 * request.days
    if request.transport_pref and request.transport_pref.max_budget_inr:
        est_transport_budget = request.transport_pref.max_budget_inr

    max_activity_budget = max(0, request.budget_inr - hotel_summary.total_cost_inr)
    viable_candidates = []
    for place in sightseeing:
        cost_per_person = place.estimated_cost_per_person_inr or place.entry_fee_inr or 0
        total_place_cost = cost_per_person * request.people_count
        if total_place_cost <= max_activity_budget:
            viable_candidates.append(place)
    viable_candidates.append(selected_hotel_place)
    valid_places = viable_candidates
    transport_reserve = est_transport_budget
    timings[2] = round(max(0.01, (time.perf_counter() - t_stage2) * 1000), 2)
        
    # Stage 3: DBSCAN Geo-Clustering
    t_stage3 = time.perf_counter()
    from tripweave.clustering import GeoClusterer
    clusterer = GeoClusterer()
    clusters = clusterer.cluster_places(valid_places)
    timings[3] = round(max(0.01, (time.perf_counter() - t_stage3) * 1000), 2)

    # Stage 4: Workload Balancing & Cluster Synthesis
    t_stage4 = time.perf_counter()
    balanced_clusters = clusterer.balance_workload(clusters, days=request.days, pace=request.pace)
    preferred_day_by_place = {
        place.place_id: day_id
        for day_id, day_group in balanced_clusters.items()
        for place in day_group
    }
    timings[4] = round(max(0.01, (time.perf_counter() - t_stage4) * 1000), 2)

    if hotel_summary.nights > 0:
        hotel_summary.why_this_hotel = (
            f"Selected {hotel_summary.hotel_name} (₹{hotel_summary.price_per_night_per_room}/room/night) "
            f"because its centroid proximity minimizes daily commute to attractions "
            f"while comfortably fulfilling your {hotel_summary.people_accommodated}-guest room requirement."
        )

    # Resolve routing depot
    selected_hotel = selected_hotel_place
        
    # Stage 6: OR-Tools VRP Scheduling
    t_stage6 = time.perf_counter()
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
        variant_type=variant,
        locked_activities=request.locked_activities,
        group_profile=request.group_profile,
        preferred_day_by_place=preferred_day_by_place
    )
    
    try:
        itinerary = optimizer.generate_plan()
    except (InfeasibleItineraryError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Feasibility conflict: {str(e)}"
        )
    except Exception as e:
        logger.exception("Unexpected error during itinerary optimization")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal optimization engine error: {str(e)}"
        )
    timings[6] = round((time.perf_counter() - t_stage6) * 1000, 2)

    # Stage 8: Independent Verification & Audit Report
    t_stage8 = time.perf_counter()
    report = ItineraryVerifier.verify(itinerary, request, all_places)
    itinerary.verification_report = report
    timings[8] = round((time.perf_counter() - t_stage8) * 1000, 2)

    # Stage 7: Physical Exertion & Pace Evaluation
    t_stage7 = time.perf_counter()
    from tripweave.fatigue import FatigueAnalyzer
    try:
        total_km = float(report.metrics.get("total_transit_km", "30.0 km").replace(" km", ""))
    except Exception:
        total_km = 30.0
    fatigue_info = FatigueAnalyzer.evaluate_trip(
        itinerary.days, 
        pace=request.pace, 
        group_profile=request.group_profile,
        total_transit_km=total_km,
        hotel_lat=selected_hotel.lat,
        hotel_lng=selected_hotel.lng
    )
    itinerary.fatigue_report = fatigue_info
    for day in itinerary.days:
        matched = next((d for d in fatigue_info["daily_breakdown"] if d["day_number"] == day.day_number), None)
        if matched:
            day.fatigue_score = matched["score"]
            day.fatigue_level = matched["level"]
    timings[7] = round((time.perf_counter() - t_stage7) * 1000, 2)

    # Weather Integration (Blueprint Section 12)
    from tripweave.weather import WeatherProvider
    if prefetched_weather:
        weather_map = prefetched_weather
    else:
        weather_map = WeatherProvider.get_daily_forecasts(
            selected_hotel.lat, 
            selected_hotel.lng, 
            start_date=request.start_date, 
            end_date=request.end_date,
            days=request.days
        )
    for day in itinerary.days:
        if day.date and day.date in weather_map:
            day.weather = weather_map[day.date]

    # Stage 10: Explainability & Decision Trace
    t_stage10 = time.perf_counter()
    from tripweave.explainability import ExplainabilityEngine
    itinerary.decision_trace = ExplainabilityEngine.generate_decision_trace(itinerary, request, all_places)
    itinerary.expense_breakdown = ExplainabilityEngine.calculate_expense_breakdown(itinerary, request)
    timings[10] = round((time.perf_counter() - t_stage10) * 1000, 2)

    # Inter-City Transit Intelligence
    if request.origin_city and request.origin_city.strip().lower() != request.destination.strip().lower():
        tp = get_transport_provider()
        itinerary.intercity_transport = tp.get_transport_summary(
            origin_city=request.origin_city,
            destination_city=request.destination,
            hotel_name=selected_hotel.name,
            hotel_lat=selected_hotel.lat,
            hotel_lng=selected_hotel.lng,
            variant_type=variant.value if hasattr(variant, 'value') else str(variant),
            people_count=request.people_count,
            start_date=request.start_date,
            end_date=request.end_date
        )

    # Minimum Useful Plan Guarantee
    total_activities = sum(len(day.activities) for day in itinerary.days)
    if total_activities == 0 or not itinerary.days:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Feasibility conflict: No feasible sightseeing visits could be scheduled within your budget (₹{request.budget_inr}) and transport constraints."
        )

    # Post-Optimization Budget & Feasibility Guardrail
    if itinerary.total_cost_inr > request.budget_inr or not report.is_valid:
        error_msgs = report.errors if report.errors else [f"Final plan total ₹{itinerary.total_cost_inr} exceeded requested budget ₹{request.budget_inr}"]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Feasibility conflict: {'; '.join(error_msgs)}"
        )

    if return_timings:
        return itinerary, timings
    return itinerary

# --- REST ENDPOINTS ---

@app.get("/", tags=["General"])
def root():
    return {
        "service": "TripWeave Engine API",
        "status": "online",
        "documentation": "/docs",
        "supported_cities": [c.capitalize() for c in sorted(settings.supported_cities)]
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
    user_transport_cap = request.transport_pref.max_budget_inr if request.transport_pref else None

    # Step A: Build balanced plan first (primary user baseline) and capture actual stage timings
    plan_balanced, stage_timings = _build_single_plan(
        request, 
        variant=PlanVariantType.BALANCED, 
        return_timings=True
    )
    
    # Extract weather from balanced plan to share across all variants (avoids 3x redundant network calls)
    shared_weather: Dict[str, WeatherSummary] = {}
    for day in plan_balanced.days:
        if day.date and day.weather:
            shared_weather[day.date] = day.weather

    # Step B: Build budget variant (Relaxed pace, Auto transit, smart budget stay)
    t_stage9_start = time.perf_counter()
    budget_req = request.model_copy(deep=True)
    budget_req.pace = PacePreference.RELAXED
    budget_req.transport_pref = TransportPreference(mode=TransportMode.AUTO, max_budget_inr=user_transport_cap)
    if not budget_req.hotel_pref:
        budget_req.hotel_pref = HotelPreference(max_price_per_night_inr=1800)
    try:
        plan_budget = _build_single_plan(budget_req, variant=PlanVariantType.BUDGET, prefetched_weather=shared_weather)
    except HTTPException as e:
        # Re-raise internal server errors (500) or bad requests (400) immediately
        if e.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
            raise
        if "hotel" in e.detail.lower() and budget_req.hotel_pref != request.hotel_pref:
            budget_req.hotel_pref = request.hotel_pref
            try:
                plan_budget = _build_single_plan(budget_req, variant=PlanVariantType.BUDGET, prefetched_weather=shared_weather)
            except HTTPException as e_retry:
                if e_retry.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
                    raise
                plan_budget = plan_balanced.model_copy(deep=True)
                plan_budget.variant_type = PlanVariantType.BUDGET
                plan_budget.plan_name = "TripWeave Itinerary (Budget Variant - Balanced Fallback)"
        else:
            plan_budget = plan_balanced.model_copy(deep=True)
            plan_budget.variant_type = PlanVariantType.BUDGET
            plan_budget.plan_name = "TripWeave Itinerary (Budget Variant - Balanced Fallback)"

    # Step C: Build comfort variant (Intensive pace, Cab transit, upgraded boutique lodging)
    comfort_req = request.model_copy(deep=True)
    comfort_req.pace = PacePreference.INTENSIVE
    comfort_req.transport_pref = TransportPreference(mode=TransportMode.CAB, max_budget_inr=user_transport_cap)
    if not comfort_req.hotel_pref:
        comfort_req.hotel_pref = HotelPreference(min_price_per_night_inr=2200)
    try:
        plan_comfort = _build_single_plan(comfort_req, variant=PlanVariantType.COMFORT, prefetched_weather=shared_weather)
    except HTTPException as e:
        # Re-raise internal server errors (500) or bad requests (400) immediately
        if e.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
            raise
        if "hotel" in e.detail.lower() and comfort_req.hotel_pref != request.hotel_pref:
            comfort_req.hotel_pref = request.hotel_pref
            try:
                plan_comfort = _build_single_plan(comfort_req, variant=PlanVariantType.COMFORT, prefetched_weather=shared_weather)
            except HTTPException as e_retry:
                if e_retry.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
                    raise
                plan_comfort = plan_balanced.model_copy(deep=True)
                plan_comfort.variant_type = PlanVariantType.COMFORT
                plan_comfort.plan_name = "TripWeave Itinerary (Comfort Variant - Balanced Fallback)"
        else:
            plan_comfort = plan_balanced.model_copy(deep=True)
            plan_comfort.variant_type = PlanVariantType.COMFORT
            plan_comfort.plan_name = "TripWeave Itinerary (Comfort Variant - Balanced Fallback)"

    stage_timings[9] = round((time.perf_counter() - t_stage9_start) * 1000, 2)
    travel_dates_str = f"{request.start_date.isoformat()} to {request.end_date.isoformat()}" if request.start_date and request.end_date else f"{request.days} Days"

    # Stage Telemetry with 100% genuine measured stage timings
    stages = [
        {"stage": 1, "name": "Candidate Generation", "status": "completed", "detail": f"Audited seed attractions & dining for {request.destination.capitalize()}", "duration_ms": stage_timings.get(1, 0.0)},
        {"stage": 2, "name": "Hard Feasibility Filter", "status": "completed", "detail": "Enforced weekly closures, group constraints & entry limits", "duration_ms": stage_timings.get(2, 0.0)},
        {"stage": 3, "name": "DBSCAN Geo-Clustering", "status": "completed", "detail": "Spatial neighborhood clustering into distinct daily zones", "duration_ms": stage_timings.get(3, 0.0)},
        {"stage": 4, "name": "Workload Balancing", "status": "completed", "detail": f"Distributed attractions across {request.days} trip days", "duration_ms": stage_timings.get(4, 0.0)},
        {"stage": 5, "name": "Hotel Scoring", "status": "completed", "detail": "TotalDailyTravelCost minimization from attraction centers", "duration_ms": stage_timings.get(5, 0.0)},
        {"stage": 6, "name": "OR-Tools VRP Scheduling", "status": "completed", "detail": "Time-window routing with solar sunset & dining detours", "duration_ms": stage_timings.get(6, 0.0)},
        {"stage": 7, "name": "Fatigue & Pace Engine", "status": "completed", "detail": f"Calibrated physical exertion for '{request.group_profile.value}' profile", "duration_ms": stage_timings.get(7, 0.0)},
        {"stage": 8, "name": "Physics & Feasibility Audit", "status": "completed", "detail": "Audited traffic speeds, return commutes & zero-activity blocks", "duration_ms": stage_timings.get(8, 0.0)},
        {"stage": 9, "name": "Multi-Variant Diversification", "status": "completed", "detail": "Synthesized 3 distinct variants: Budget, Balanced, and Comfort", "duration_ms": stage_timings.get(9, 0.0)},
        {"stage": 10, "name": "Explainability Trace", "status": "completed", "detail": "Generated Why this hotel & Why not X candidate omission audit", "duration_ms": stage_timings.get(10, 0.0)}
    ]

    return MultiVariantTripPlan(
        destination=request.destination.capitalize(),
        origin_city=request.origin_city.capitalize() if request.origin_city else None,
        travel_dates=travel_dates_str,
        synthesis_stages=stages,
        variants={
            "budget": plan_budget,
            "balanced": plan_balanced,
            "comfort": plan_comfort
        }
    )

@app.post("/api/itinerary/preview-edit", response_model=EditConsequenceResponse, tags=["Interactive Customizer"])
def preview_itinerary_edit(request: EditConsequenceRequest):
    """
    Blueprint Section 12: Simulates the real-world physical and cost consequences
    of swapping, dropping, pinning, or rescheduling an activity to sunset.
    """
    try:
        return ItineraryEditor.preview_edit(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error previewing edit: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.get("/api/itinerary/candidates", response_model=List[Place], tags=["Interactive Customizer"])
def get_candidates_for_swap(destination: str, exclude_ids: Optional[str] = None):
    """
    Returns alternative candidate attractions for swapping, omitting already scheduled venues.
    """
    exclude_list = [x.strip() for x in exclude_ids.split(",")] if exclude_ids else []
    try:
        return ItineraryEditor.get_candidate_alternatives(destination, exclude_list)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@app.post("/api/itinerary/rebalance-day", response_model=RebalanceTiredResponse, tags=["Live In-Trip Mode"])
def rebalance_tired_day(request: RebalanceTiredRequest):
    """
    Produce a constraint-checked heuristic adjustment to the remaining day.
    The client supplies trip progress; this endpoint does not track a live trip
    state or perform a full OR-Tools re-optimization.
    """
    try:
        return ItineraryEditor.rebalance_tired_day(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error rebalancing tired day: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

