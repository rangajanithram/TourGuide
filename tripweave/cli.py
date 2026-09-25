import json
import os
import sys
from pprint import pprint
from tripweave.models import TripRequest, Place, HotelPreference, TransportPreference

# Fix for Windows terminals not supporting emojis by default
sys.stdout.reconfigure(encoding='utf-8')

def load_places() -> list[Place]:
    """Loads our verified data from the JSON file."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, 'data', 'hyderabad_mock.json')
    
    with open(data_path, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
    
    return [Place(**item) for item in raw_data]

def main():
    print("🚀 Starting TripWeave CLI (Phase 0)...")
    
    # 1. Simulate a user requesting a trip with hotel & transport preferences
    # Example: 3 travelers, 2 days (1 night), total budget ₹12,000
    # Hotel range: ₹1,500 to ₹3,000 per night
    # Transport mode: Auto (rickshaw) with ₹500 budget limit
    request = TripRequest(
        destination="Hyderabad",
        days=2,
        budget_inr=12000,
        people_count=3,
        interests=["history", "food"],
        pace="balanced",
        hotel_pref=HotelPreference(
            min_price_per_night_inr=1500,
            max_price_per_night_inr=3000
        ),
        transport_pref=TransportPreference(
            mode="auto",
            max_budget_inr=600
        )
    )
    
    print("\n--- User Request & Preferences ---")
    pprint(request.model_dump())
    
    # 2. Load the candidate places and hotels
    print("\n--- Candidate Database Loaded ---")
    places = load_places()
    for p in places:
        if p.place_type == "hotel":
            print(f"🏨 [Hotel] {p.name} - ₹{p.price_per_night_inr}/night (Max {p.max_guests_per_room} guests/room) | Source: {p.data_source}")
        else:
            print(f"📍 [{p.place_type.capitalize()}] {p.name} - Entry: ₹{p.entry_fee_inr}/pax")
        
    # 3. Filter the Candidates & Select Hotel
    from tripweave.feasibility import FeasibilityFilter
    print("\n🧐 Evaluating Feasibility (Hotel Selection, Capacity Math & Budget Envelopes)...")
    
    filter_engine = FeasibilityFilter()
    
    try:
        valid_places, hotel_summary, transport_reserve = filter_engine.filter_candidates(places, request)
        print(f"\n✅ Hotel Successfully Selected:")
        print(f"   Name: {hotel_summary.hotel_name}")
        print(f"   Nightly Rate: ₹{hotel_summary.price_per_night_per_room} per room")
        print(f"   Travelers: {hotel_summary.people_accommodated} people")
        print(f"   Rooms Needed: {hotel_summary.rooms_needed} room(s) (Based on 2 pax/room standard)")
        print(f"   Duration: {hotel_summary.nights} night(s)")
        print(f"   Total Stay Cost: ₹{hotel_summary.total_cost_inr}")
        print(f"   Source Verification: {hotel_summary.source_verification}")
        print(f"   Reserved Transport Budget: ₹{transport_reserve} (Mode: {request.transport_pref.mode})")
    except Exception as e:
        print(f"\n❌ Feasibility Failed: {e}")
        return
        
    # 4. Run the Optimizer
    from tripweave.optimizer import TripOptimizer
    print("\n⚙️  Running OR-Tools Optimizer with Multi-Modal Routing...")
    
    selected_hotel_place = next(p for p in valid_places if p.name == hotel_summary.hotel_name)
    
    optimizer = TripOptimizer(
        places=valid_places, 
        days=request.days, 
        hotel_id=selected_hotel_place.place_id,
        hotel_summary=hotel_summary,
        transport_mode=request.transport_pref.mode,
        people_count=request.people_count
    )
    
    try:
        final_plan = optimizer.generate_plan()
        print("\n🎉 Optimization Complete! Here is the full verified itinerary:\n")
        pprint(final_plan.model_dump())
    except Exception as e:
        print(f"\n❌ Optimization Failed: {e}")

if __name__ == "__main__":
    main()
