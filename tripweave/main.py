import os
import time
import logging
import threading
from urllib.parse import urlparse
from collections import deque
from contextlib import contextmanager
from typing import List, Optional, Dict, Deque, Tuple
from fastapi import FastAPI, HTTPException, status, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
from tripweave.auth import get_current_user, UserProfile

# ---------------------------------------------------------------------------
# Process-Local Production Protection Guardrails
# Note: These rate-limit and concurrency controls are process-local per worker
# instance. Multi-instance deployments require shared edge/Redis enforcement.
# ---------------------------------------------------------------------------
MAX_REQUEST_BYTES = 262_144  # 256 KB payload bound for itinerary/customizer endpoints
_RATE_LIMIT_LOCK = threading.Lock()
_USER_REQUEST_HISTORY: Dict[Tuple[str, str], Deque[float]] = {}
_SOLVER_SEMAPHORE = threading.BoundedSemaphore(settings.solver_concurrency)


def _enforce_rate_limit(
    current_user: object,
    bucket: str,
    limit: int = 20,
    window_sec: float = 60.0,
) -> None:
    """Process-local sliding-window rate limiter keyed by verified user id and endpoint bucket."""
    if not isinstance(current_user, UserProfile):
        return
    now = time.monotonic()
    key = (current_user.id, bucket)
    with _RATE_LIMIT_LOCK:
        dq = _USER_REQUEST_HISTORY.get(key)
        if dq is None:
            dq = deque()
            _USER_REQUEST_HISTORY[key] = dq
        while dq and (now - dq[0]) >= window_sec:
            dq.popleft()
        if len(dq) >= limit:
            retry_after = max(1, int(round(window_sec - (now - dq[0]))))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Rate limit exceeded for {bucket} ({limit} requests per {int(window_sec)}s per user; "
                    f"process-local guardrail). Please retry in {retry_after}s."
                ),
                headers={"Retry-After": str(retry_after)},
            )
        dq.append(now)


@contextmanager
def _solver_slot(timeout_sec: float = settings.solver_queue_timeout_seconds):
    """Bounds concurrent OR-Tools / edit solver executions within a single process."""
    acquired = _SOLVER_SEMAPHORE.acquire(timeout=timeout_sec)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Optimization engine is currently at capacity (process-local concurrency guardrail). Please retry shortly.",
            headers={"Retry-After": "5"},
        )
    try:
        yield
    finally:
        _SOLVER_SEMAPHORE.release()


def _variant_signature(plan: TripPlan) -> tuple:
    """Computes a structural fingerprint of a TripPlan to detect duplicate variants."""
    hotel_id = plan.hotel_summary.hotel_id if plan.hotel_summary else ""
    mode = plan.transport_mode.value if hasattr(plan.transport_mode, "value") else str(plan.transport_mode)
    schedule_sig = tuple(
        (
            d.day_number,
            tuple((a.place_id or a.place_name, a.start_time, a.end_time) for a in d.activities),
        )
        for d in plan.days
    )
    return (hotel_id, mode, plan.total_cost_inr, schedule_sig)


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
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_protection_middleware(request: Request, call_next):
    """Enforces request payload bounds and private no-store cache headers on user-specific API routes."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"detail": f"Request payload exceeds the {MAX_REQUEST_BYTES // 1024} KB maximum size limit."},
                )
        except ValueError:
            pass

    if request.method in ("POST", "PUT", "PATCH"):
        body = await request.body()
        if len(body) > MAX_REQUEST_BYTES:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"detail": f"Request payload exceeds the {MAX_REQUEST_BYTES // 1024} KB maximum size limit."},
            )

    response = await call_next(request)
    if request.url.path.startswith("/api/itinerary") or request.url.path.startswith("/api/auth"):
        response.headers["Cache-Control"] = "private, no-store"
    return response


@app.get("/health", tags=["Health"])
@app.get("/", tags=["Health"])
def health_check():
    """Health check endpoint for deployment platforms (Render, Railway, Fly.io)."""
    return {
        "status": "healthy",
        "service": "TripWeave Optimization Engine API",
        "version": "1.0.0"
    }


@app.get("/ready", tags=["Health"])
def readiness_check():
    """Local configuration/catalog readiness, not proof that external services are reachable.

    No solver runs, network calls, credentials or filesystem paths are exposed.
    Liveness remains independent so a configuration failure cannot cause restart loops.
    """
    project = urlparse(settings.supabase_url or "")
    local = settings.environment != "production" and project.hostname in {"localhost", "127.0.0.1"}
    auth_configured = bool(
        settings.supabase_publishable_key and project.hostname
        and "your-project" not in project.hostname
        and (project.scheme == "https" or local)
    )
    catalog_ready = True
    try:
        provider = get_places_provider()
        cities = provider.get_supported_cities()
        catalog_ready = bool(cities)
        for city in cities:
            places = provider.get_places(city)
            ids = [place.place_id for place in places]
            if (len(ids) != len(set(ids)) or not any(place.place_type == "hotel" for place in places)
                    or not any(place.place_type not in {"hotel", "restaurant", "rest_break"} for place in places)):
                catalog_ready = False
    except Exception:
        logger.exception("Catalog readiness check failed")
        catalog_ready = False
    ready = auth_configured and catalog_ready
    return JSONResponse(status_code=200 if ready else 503, content={
        "status": "ready" if ready else "not_ready",
        "checks": {"auth_configuration": auth_configured, "catalog": catalog_ready},
        "data_source": "curated_catalog",
        "external_services_verified": False,
    }, headers={"Cache-Control": "no-store", **({} if ready else {"Retry-After": "5"})})


def get_database_places(destination: str = "hyderabad") -> List[Place]:
    """Loads curated places via the PlacesDataProvider abstraction."""
    provider = get_places_provider()
    try:
        return provider.get_places(destination)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except (FileNotFoundError, OSError) as e:
        logger.exception("Catalog unavailable")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Destination data is temporarily unavailable. Please try again later.") from e

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
def generate_itinerary(request: TripRequest, current_user: UserProfile = Depends(get_current_user)):
    """
    Generates a single optimal itinerary based on user constraints.
    Enforces opening hours, day-of-week closures, golden hour, and budget limits.
    """
    _enforce_rate_limit(current_user, bucket="generate", limit=15, window_sec=60.0)
    with _solver_slot():
        return _build_single_plan(request, variant=PlanVariantType.BALANCED)

@app.post("/api/itinerary/generate-variants", response_model=MultiVariantTripPlan, tags=["Itinerary Generation"])
def generate_variants(request: TripRequest, current_user: UserProfile = Depends(get_current_user)):
    """
    Blueprint Stage 9: Generates up to 3 genuinely distinct feasible plan variants:
    1. Budget / Relaxed: Slower pace (2 places/day), lower expense.
    2. Balanced: Optimal trade-off with iconic golden-hour highlights.
    3. Comfort: Intensive pace (4 places/day) with cab transit.
    Never copies Balanced as a fake Budget/Comfort variant when constraints are tight.
    """
    _enforce_rate_limit(current_user, bucket="generate-variants", limit=12, window_sec=60.0)
    with _solver_slot():
        user_transport_cap = request.transport_pref.max_budget_inr if request.transport_pref else None
        unavailable_variants: Dict[str, str] = {}
        stage_timings: Dict[int, float] = {}
        shared_weather: Dict[str, WeatherSummary] = {}

        # Step A: Attempt Balanced variant first (primary user baseline)
        plan_balanced: Optional[TripPlan] = None
        try:
            plan_balanced, stage_timings = _build_single_plan(
                request,
                variant=PlanVariantType.BALANCED,
                return_timings=True
            )
            for day in plan_balanced.days:
                if day.date and day.weather:
                    shared_weather[day.date] = day.weather
        except HTTPException as e:
            if e.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
                raise
            unavailable_variants["balanced"] = str(e.detail)

        # Step B: Attempt Budget variant (Relaxed pace, Auto transit, budget-conscious stay)
        t_stage9_start = time.perf_counter()
        plan_budget: Optional[TripPlan] = None
        budget_req = request.model_copy(deep=True)
        budget_req.pace = PacePreference.RELAXED
        budget_req.transport_pref = TransportPreference(mode=TransportMode.AUTO, max_budget_inr=user_transport_cap)
        if not budget_req.hotel_pref:
            budget_req.hotel_pref = HotelPreference(max_price_per_night_inr=1800)
        try:
            if plan_balanced is None:
                plan_budget, stage_timings = _build_single_plan(
                    budget_req, variant=PlanVariantType.BUDGET, prefetched_weather=shared_weather or None, return_timings=True
                )
            else:
                plan_budget = _build_single_plan(
                    budget_req, variant=PlanVariantType.BUDGET, prefetched_weather=shared_weather or None
                )
        except HTTPException as e:
            if e.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
                raise
            if "hotel" in str(e.detail).lower() and budget_req.hotel_pref != request.hotel_pref:
                budget_req.hotel_pref = request.hotel_pref
                try:
                    if plan_balanced is None and not stage_timings:
                        plan_budget, stage_timings = _build_single_plan(
                            budget_req, variant=PlanVariantType.BUDGET, prefetched_weather=shared_weather or None, return_timings=True
                        )
                    else:
                        plan_budget = _build_single_plan(
                            budget_req, variant=PlanVariantType.BUDGET, prefetched_weather=shared_weather or None
                        )
                except HTTPException as e_retry:
                    if e_retry.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
                        raise
                    unavailable_variants["budget"] = str(e_retry.detail)
            else:
                unavailable_variants["budget"] = str(e.detail)

        if plan_budget is not None and not shared_weather:
            for day in plan_budget.days:
                if day.date and day.weather:
                    shared_weather[day.date] = day.weather

        # Step C: Attempt Comfort variant (Intensive pace, Cab transit, upgraded boutique lodging)
        plan_comfort: Optional[TripPlan] = None
        comfort_req = request.model_copy(deep=True)
        comfort_req.pace = PacePreference.INTENSIVE
        comfort_req.transport_pref = TransportPreference(mode=TransportMode.CAB, max_budget_inr=user_transport_cap)
        if not comfort_req.hotel_pref:
            comfort_req.hotel_pref = HotelPreference(min_price_per_night_inr=2200)
        try:
            if plan_balanced is None and plan_budget is None and not stage_timings:
                plan_comfort, stage_timings = _build_single_plan(
                    comfort_req, variant=PlanVariantType.COMFORT, prefetched_weather=shared_weather or None, return_timings=True
                )
            else:
                plan_comfort = _build_single_plan(
                    comfort_req, variant=PlanVariantType.COMFORT, prefetched_weather=shared_weather or None
                )
        except HTTPException as e:
            if e.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
                raise
            if "hotel" in str(e.detail).lower() and comfort_req.hotel_pref != request.hotel_pref:
                comfort_req.hotel_pref = request.hotel_pref
                try:
                    if plan_balanced is None and plan_budget is None and not stage_timings:
                        plan_comfort, stage_timings = _build_single_plan(
                            comfort_req, variant=PlanVariantType.COMFORT, prefetched_weather=shared_weather or None, return_timings=True
                        )
                    else:
                        plan_comfort = _build_single_plan(
                            comfort_req, variant=PlanVariantType.COMFORT, prefetched_weather=shared_weather or None
                        )
                except HTTPException as e_retry:
                    if e_retry.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
                        raise
                    unavailable_variants["comfort"] = str(e_retry.detail)
            else:
                unavailable_variants["comfort"] = str(e.detail)

        # Deduplicate variants so we never return identical schedules disguised as different tiers
        # Evaluate 'balanced' first so the primary baseline is retained when a secondary tier is identical.
        seen_signatures: Dict[tuple, str] = {}
        accepted_by_key: Dict[str, TripPlan] = {}
        for v_key, candidate_plan in (
            ("balanced", plan_balanced),
            ("budget", plan_budget),
            ("comfort", plan_comfort),
        ):
            if candidate_plan is None:
                continue
            sig = _variant_signature(candidate_plan)
            if sig in seen_signatures:
                existing_key = seen_signatures[sig]
                unavailable_variants[v_key] = (
                    f"Produced the same schedule, hotel, transport mode, and cost as the '{existing_key.capitalize()}' "
                    f"variant under your current constraints, so duplicate output was omitted."
                )
            else:
                seen_signatures[sig] = v_key
                accepted_by_key[v_key] = candidate_plan

        ordered_variants: Dict[str, TripPlan] = {
            k: accepted_by_key[k]
            for k in ("budget", "balanced", "comfort")
            if k in accepted_by_key
        }

        if not ordered_variants:
            primary_reason = (
                unavailable_variants.get("balanced")
                or unavailable_variants.get("budget")
                or unavailable_variants.get("comfort")
                or "No feasible itinerary variants could be generated for the given constraints."
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=primary_reason,
            )

        stage_timings[9] = round((time.perf_counter() - t_stage9_start) * 1000, 2)
        travel_dates_str = f"{request.start_date.isoformat()} to {request.end_date.isoformat()}" if request.start_date and request.end_date else f"{request.days} Days"
        variant_names_str = ", ".join(k.capitalize() for k in ordered_variants.keys())

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
            {"stage": 9, "name": "Multi-Variant Diversification", "status": "completed", "detail": f"Synthesized {len(ordered_variants)} distinct feasible variant(s): {variant_names_str}", "duration_ms": stage_timings.get(9, 0.0)},
            {"stage": 10, "name": "Explainability Trace", "status": "completed", "detail": "Generated Why this hotel & Why not X candidate omission audit", "duration_ms": stage_timings.get(10, 0.0)}
        ]

        return MultiVariantTripPlan(
            schema_version=1,
            destination=request.destination.capitalize(),
            origin_city=request.origin_city.capitalize() if request.origin_city else None,
            travel_dates=travel_dates_str,
            synthesis_stages=stages,
            variants=ordered_variants,
            unavailable_variants=unavailable_variants,
        )

@app.post("/api/itinerary/preview-edit", response_model=EditConsequenceResponse, tags=["Interactive Customizer"])
def preview_itinerary_edit(request: EditConsequenceRequest, current_user: UserProfile = Depends(get_current_user)):
    """
    Blueprint Section 12: Simulates the real-world physical and cost consequences
    of swapping, dropping, pinning, or rescheduling an activity to sunset.
    """
    _enforce_rate_limit(current_user, bucket="preview-edit", limit=30, window_sec=60.0)
    with _solver_slot():
        try:
            return ItineraryEditor.preview_edit(request)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            logger.error(f"Error previewing edit: {e}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.get("/api/itinerary/candidates", response_model=List[Place], tags=["Interactive Customizer"])
def get_candidates_for_swap(destination: str, exclude_ids: Optional[str] = None, current_user: UserProfile = Depends(get_current_user)):
    """
    Returns alternative candidate attractions for swapping, omitting already scheduled venues.
    """
    _enforce_rate_limit(current_user, bucket="candidates", limit=60, window_sec=60.0)
    exclude_list = [x.strip() for x in exclude_ids.split(",")] if exclude_ids else []
    try:
        return ItineraryEditor.get_candidate_alternatives(destination, exclude_list)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@app.post("/api/itinerary/rebalance-day", response_model=RebalanceTiredResponse, tags=["Live In-Trip Mode"])
def rebalance_tired_day(request: RebalanceTiredRequest, current_user: UserProfile = Depends(get_current_user)):
    """
    Produce a constraint-checked heuristic adjustment to the remaining day.
    The client supplies trip progress; this endpoint does not track a live trip
    state or perform a full OR-Tools re-optimization.
    """
    _enforce_rate_limit(current_user, bucket="rebalance-day", limit=20, window_sec=60.0)
    with _solver_slot():
        try:
            return ItineraryEditor.rebalance_tired_day(request)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            logger.error(f"Error rebalancing tired day: {e}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ---------------------------------------------------------------------------
# AUTHENTICATION & IDENTITY ENDPOINTS
# ---------------------------------------------------------------------------
@app.get("/api/auth/me", response_model=UserProfile, tags=["Authentication"])
def api_get_me(current_user: UserProfile = Depends(get_current_user)):
    """Trusted identity from Supabase; planning endpoints require verified users."""
    return current_user


@app.post("/api/auth/signup", tags=["Authentication"], deprecated=True)
@app.post("/api/auth/login", tags=["Authentication"], deprecated=True)
@app.post("/api/auth/google", tags=["Authentication"], deprecated=True)
@app.post("/api/auth/logout", tags=["Authentication"], deprecated=True)
def retired_local_auth():
    raise HTTPException(status_code=410, detail="Use Supabase authentication through the web application.")
