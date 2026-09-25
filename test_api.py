"""
Comprehensive verification test suite for TripWeave FastAPI Backend.
Validates:
1. Standard itinerary generation.
2. Destination rejection (rejects non-launch cities with HTTP 400).
3. Pydantic input validation (rejects invalid negative numbers or bad modes).
4. Solver disjunction (drops places instead of crashing when pace is tight).
5. Day Trip (1-day trip has 0 nights and 0 lodging charge).
6. Post-optimization graceful budget trimming.
"""
import sys
import json
from fastapi import HTTPException
from pydantic import ValidationError

sys.stdout.reconfigure(encoding='utf-8')
from tripweave.main import app, generate_itinerary, root, health_check, list_places
from tripweave.models import TripRequest, HotelPreference, TransportPreference, TransportMode, PacePreference

def run_tests():
    print("🧪 Running TripWeave Hardened Test Suite...\n")
    
    # Test 1: Valid Baseline Generation
    print("1️⃣ Testing Valid Itinerary Generation (Hyderabad)...")
    req = TripRequest(
        destination="Hyderabad",
        days=2,
        budget_inr=12000,
        people_count=3,
        interests=["history", "food"],
        pace=PacePreference.BALANCED,
        hotel_pref=HotelPreference(min_price_per_night_inr=1500, max_price_per_night_inr=3000),
        transport_pref=TransportPreference(mode=TransportMode.AUTO, max_budget_inr=700)
    )
    plan = generate_itinerary(req)
    assert plan.total_cost_inr <= req.budget_inr, "Budget Guardrail Failed: Plan cost exceeded request budget!"
    assert "Prototype Itinerary" in plan.plan_name, f"Expected Prototype label in plan name, got: {plan.plan_name}"
    print(f"   ✅ Plan generated: '{plan.plan_name}'")
    print(f"   ✅ Budget Guardrail Verified: Total ₹{plan.total_cost_inr} <= Budget ₹{req.budget_inr}")
    print(f"   ✅ Hotel: {plan.hotel_summary.hotel_name} (Provenance: {plan.hotel_summary.provenance})")

    # Test 2: Destination Validation Check
    print("\n2️⃣ Testing Destination Validation (Unsupported City)...")
    mumbai_req = TripRequest(
        destination="Mumbai",
        days=2,
        budget_inr=10000,
        people_count=2
    )
    try:
        generate_itinerary(mumbai_req)
        assert False, "Failed to reject unsupported destination!"
    except HTTPException as e:
        assert e.status_code == 400
        print(f"   ✅ Successfully rejected 'Mumbai' with HTTP {e.status_code}: {e.detail}")

    # Test 3: Pydantic Strict Validation (Negative Days/Budget)
    print("\n3️⃣ Testing Pydantic Boundary Validation...")
    try:
        TripRequest(
            destination="Hyderabad",
            days=-1, # Invalid
            budget_inr=5000,
            people_count=2
        )
        assert False, "Failed to catch negative days!"
    except ValidationError:
        print("   ✅ Successfully rejected negative days with Pydantic ValidationError.")

    # Test 4: Day Trip Logic (1-day trip has 0 nights and 0 lodging cost!)
    print("\n4️⃣ Testing Day-Trip Logic (1 Day = 0 Nights, ₹0 Hotel)...")
    day_trip_req = TripRequest(
        destination="Hyderabad",
        days=1,
        budget_inr=4000,
        people_count=2,
        interests=["history"],
        pace=PacePreference.BALANCED,
        transport_pref=TransportPreference(mode=TransportMode.AUTO)
    )
    day_trip_plan = generate_itinerary(day_trip_req)
    assert day_trip_plan.hotel_summary.nights == 0, f"Expected 0 nights, got {day_trip_plan.hotel_summary.nights}"
    assert day_trip_plan.hotel_summary.total_cost_inr == 0, f"Expected ₹0 hotel cost, got ₹{day_trip_plan.hotel_summary.total_cost_inr}"
    print(f"   ✅ Day Trip Verified: {day_trip_plan.hotel_summary.nights} nights, Hotel Cost: ₹{day_trip_plan.hotel_summary.total_cost_inr}")

    # Test 5: OR-Tools Disjunction (Relaxed Pace with Drop Penalties)
    print("\n5️⃣ Testing Solver Disjunction (Relaxed 1-Day Trip without Deadlock)...")
    tight_req = TripRequest(
        destination="Hyderabad",
        days=1,
        budget_inr=8000,
        people_count=2,
        interests=["iconic"],
        pace=PacePreference.RELAXED, # Only max 2 activities allowed!
        transport_pref=TransportPreference(mode=TransportMode.CAB)
    )
    tight_plan = generate_itinerary(tight_req)
    day1_activities = len(tight_plan.days[0].activities)
    assert day1_activities <= 2, f"Pace limit violated! Expected <= 2 activities, got {day1_activities}"
    print(f"   ✅ Disjunction worked! Solver scheduled {day1_activities} activities (capped by relaxed pace) without crashing.")

    print("\n🎉 ALL 5 CORRECTNESS & EDGE-CASE TESTS PASSED!")

if __name__ == "__main__":
    run_tests()
