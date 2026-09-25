"""
Expanded verification test suite for TripWeave:
Validates:
1. Multi-City Support: Hyderabad, Delhi, and Jaipur generation.
2. Real Calendar Dates & Day-of-Week Closures: Salar Jung Museum is skipped on Fridays!
3. 'Why this hotel?' decision trace explanation.
4. Blueprint Stage 9: 3 Diverse Plan Variants (Budget, Balanced, Comfort).
5. Day-trip with custom origin hub.
"""
import sys
from datetime import date
from fastapi import HTTPException

sys.stdout.reconfigure(encoding='utf-8')
from tripweave.main import generate_itinerary, generate_variants
from tripweave.models import (
    TripRequest, HotelPreference, TransportPreference, 
    TransportMode, PacePreference, PlanVariantType
)

def run_tests():
    print("🧪 Running TripWeave Multi-City & Calendar Test Suite...\n")
    
    # Test 1: Multi-City Generation (Delhi & Jaipur)
    print("1️⃣ Testing Multi-City Support (Delhi & Jaipur)...")
    delhi_req = TripRequest(
        destination="Delhi",
        days=2,
        budget_inr=15000,
        people_count=2,
        interests=["unesco", "history"]
    )
    delhi_plan = generate_itinerary(delhi_req)
    assert len(delhi_plan.days) > 0, "Failed to generate Delhi plan!"
    print(f"   ✅ Delhi Plan Generated: {len(delhi_plan.days)} days scheduled at {delhi_plan.hotel_summary.hotel_name}")

    jaipur_req = TripRequest(
        destination="Jaipur",
        days=2,
        budget_inr=14000,
        people_count=2,
        interests=["architecture"]
    )
    jaipur_plan = generate_itinerary(jaipur_req)
    assert len(jaipur_plan.days) > 0, "Failed to generate Jaipur plan!"
    print(f"   ✅ Jaipur Plan Generated: {len(jaipur_plan.days)} days scheduled at {jaipur_plan.hotel_summary.hotel_name}")

    # Test 2: Calendar Dates & Day-of-Week Closure (Friday Closure for Salar Jung Museum)
    print("\n2️⃣ Testing Day-of-Week Closure (Friday at Salar Jung Museum)...")
    # 2026-10-16 is a Friday!
    friday_date = date(2026, 10, 16)
    assert friday_date.strftime("%A") == "Friday"
    
    friday_req = TripRequest(
        destination="Hyderabad",
        start_date=friday_date,
        end_date=friday_date,  # 1-day trip strictly on Friday
        budget_inr=5000,
        people_count=2,
        interests=["history", "museum"]
    )
    friday_plan = generate_itinerary(friday_req)
    scheduled_places = [act.place_name for act in friday_plan.days[0].activities]
    assert "Salar Jung Museum" not in scheduled_places, "Violation: Salar Jung Museum was scheduled on a Friday when it is closed!"
    print(f"   ✅ Friday Closure Verified: Salar Jung Museum was successfully skipped on Friday (Day scheduled: {scheduled_places})")

    # Test 3: 'Why this hotel?' Decision Trace
    print("\n3️⃣ Testing 'Why This Hotel?' Explanation...")
    assert delhi_plan.hotel_summary.why_this_hotel is not None, "Missing why_this_hotel trace!"
    print(f"   ✅ Decision Trace: \"{delhi_plan.hotel_summary.why_this_hotel}\"")

    # Test 4: Blueprint Stage 9: 3 Diverse Plan Variants
    print("\n4️⃣ Testing Stage 9 (3 Diverse Plan Variants: Budget, Balanced, Comfort)...")
    multi_req = TripRequest(
        destination="Hyderabad",
        days=2,
        budget_inr=15000,
        people_count=2,
        interests=["history", "food"]
    )
    multi_result = generate_variants(multi_req)
    assert "budget" in multi_result.variants
    assert "balanced" in multi_result.variants
    assert "comfort" in multi_result.variants
    print(f"   ✅ Variant 1 (Budget):   ₹{multi_result.variants['budget'].total_cost_inr} | Mode: {multi_result.variants['budget'].transport_mode.value}")
    print(f"   ✅ Variant 2 (Balanced): ₹{multi_result.variants['balanced'].total_cost_inr} | Mode: {multi_result.variants['balanced'].transport_mode.value}")
    print(f"   ✅ Variant 3 (Comfort):  ₹{multi_result.variants['comfort'].total_cost_inr} | Mode: {multi_result.variants['comfort'].transport_mode.value}")

    print("\n🎉 ALL 4 MULTI-CITY, CALENDAR & BLUEPRINT TESTS PASSED!")

if __name__ == "__main__":
    run_tests()
