import os
import json
from typing import List
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from tripweave.models import TripRequest, TripPlan, Place
from tripweave.feasibility import FeasibilityFilter
from tripweave.optimizer import TripOptimizer

# 1. Initialize FastAPI Application
app = FastAPI(
    title="TripWeave Optimization Engine API",
    description="Deterministic travel itinerary optimization engine powered by Google OR-Tools and Feasibility Filtering.",
    version="1.0.0"
)

# 2. Add CORS Middleware (Allows web browsers to communicate with this backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development; in production restrict to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_database_places() -> List[Place]:
    """Helper to load verified database candidates."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, 'data', 'hyderabad_mock.json')
    
    if not os.path.exists(data_path):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Places database file missing on server."
        )
        
    with open(data_path, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
    
    return [Place(**item) for item in raw_data]

# --- ENDPOINTS ---

@app.get("/", tags=["General"])
def root():
    """Welcome endpoint providing status and documentation link."""
    return {
        "service": "TripWeave Engine API",
        "status": "online",
        "documentation": "/docs",
        "message": "TripWeave backend is running. Open /docs in your browser to interactively test endpoints."
    }

@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "service": "tripweave-engine"}

@app.get("/api/places", response_model=List[Place], tags=["Places Database"])
def list_places():
    """Returns all verified places and hotels available for the destination."""
    return get_database_places()

@app.post("/api/itinerary/generate", response_model=TripPlan, tags=["Itinerary Generation"])
def generate_itinerary(request: TripRequest):
    """
    Main TripWeave Optimization Pipeline:
    1. Validates destination.
    2. Loads destination candidates.
    3. Feasibility Filter selects hotel (capacity math) and partitions budget envelopes.
    4. Google OR-Tools solves Time-Window routing with drop penalties & pace limits.
    5. Enforces hard post-optimization budget guardrail.
    """
    # 1. Validate destination (Reject unsupported cities cleanly)
    supported_destinations = {"hyderabad"}
    if request.destination.strip().lower() not in supported_destinations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Destination '{request.destination}' is not yet supported in Phase 0. Supported launch city: 'Hyderabad'."
        )

    # 2. Load candidates
    all_places = get_database_places()
    
    # 3. Run Stage 2: Feasibility & Hotel Selection
    filter_engine = FeasibilityFilter()
    try:
        valid_places, hotel_summary, transport_reserve = filter_engine.filter_candidates(all_places, request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Feasibility conflict: {str(e)}"
        )
        
    # 4. Find the selected hotel object for routing depot
    selected_hotel = next(
        (p for p in valid_places if p.place_id == hotel_summary.hotel_id), 
        None
    )
    if not selected_hotel:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error: Selected hotel could not be resolved as route depot."
        )
        
    # 5. Run Stage 4: OR-Tools Optimizer (with pace, interests, and drop penalties)
    optimizer = TripOptimizer(
        places=valid_places,
        days=request.days,
        hotel_id=selected_hotel.place_id,
        hotel_summary=hotel_summary,
        transport_mode=request.transport_pref.mode if request.transport_pref else "cab",
        people_count=request.people_count,
        pace=request.pace,
        interests=request.interests,
        max_total_budget=request.budget_inr,
        max_transport_budget=request.transport_pref.max_budget_inr if request.transport_pref else None
    )
    
    try:
        itinerary = optimizer.generate_plan()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Optimization failed: {str(e)}"
        )

    # 6. Post-Optimization Strict Budget Guardrail
    if itinerary.total_cost_inr > request.budget_inr:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Feasibility conflict: Final plan total (₹{itinerary.total_cost_inr}) exceeded budget (₹{request.budget_inr}) after calculating actual route transit fares. Consider increasing budget or selecting a more economical transport mode."
        )

    return itinerary
