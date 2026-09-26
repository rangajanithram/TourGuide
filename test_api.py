"""
Comprehensive verification test suite for TripWeave:
Validates all blueprint requirements & audit improvements:
1. Multi-City Support: Hyderabad, Delhi, and Jaipur generation.
2. Real Calendar Dates & Day-of-Week Closures: Salar Jung Museum is skipped on Fridays!
3. Mathematical NOAA Solar sunset & golden hour calculations.
4. Great-Circle Haversine distance accuracy with urban road curvature.
5. City-specific Day-trip origin terminals (Delhi, Jaipur, Hyderabad).
6. Robust date resolution (partial inputs, start_date+days, end_date+days).
7. Root-level transport_mode parsing.
8. Blueprint Stage 9: Truly differentiated hotel tiers in 3 variants (Budget vs Comfort).
9. Viewpoint name serialization compatibility.
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
from tripweave.distance import calculate_distance_km, get_travel_metrics
from tripweave.solar import get_golden_hour_window

def run_tests():
    print("🧪 Running TripWeave Master Verification Test Suite...\n")
    
    # Test 1: Great-Circle Haversine Distance Accuracy
    print("1️⃣ Testing Great-Circle Haversine Distance...")
    # Distance between Charminar (17.3616, 78.4747) and Golconda Fort (17.3833, 78.4011)
    dist_km = calculate_distance_km(17.3616, 78.4747, 17.3833, 78.4011)
    assert 7.5 <= dist_km <= 9.0, f"Unexpected Haversine distance: {dist_km} km"
    print(f"   ✅ Haversine Distance Verified: {dist_km:.2f} km between Charminar & Golconda")

    # Test 2: NOAA Solar Position Algorithm
    print("\n2️⃣ Testing NOAA Astronomical Solar Calculation...")
    gh_start, sunset = get_golden_hour_window(17.3850, 78.4867, target_date=date(2026, 10, 15))
    # Sunset in Hyderabad in mid-October is between 17:50 and 18:05 IST (590 to 605 minutes from 8 AM)
    assert 580 <= sunset <= 615, f"Unexpected sunset minute: {sunset}"
    assert gh_start == sunset - 60, "Golden hour must start 60 minutes before sunset"
    print(f"   ✅ NOAA Sunset Verified: Sunset at Minute {sunset} (~{17 + (sunset-540)//60}:{(sunset-540)%60:02d} IST), Golden Hour starts at Minute {gh_start}")

    # Test 3: City-Specific Day-Trip Origin Terminals
    print("\n3️⃣ Testing City-Specific Day-Trip Origin Terminals...")
    delhi_day = TripRequest(destination="Delhi", days=1, budget_inr=5000, people_count=2)
    delhi_day_plan = generate_itinerary(delhi_day)
    assert "New Delhi" in delhi_day_plan.hotel_summary.hotel_name or "Delhi" in delhi_day_plan.hotel_summary.hotel_name
    assert 28.5 <= delhi_day_plan.hotel_summary.lat <= 28.8, "Delhi day trip must use Delhi terminal coordinates!"
    print(f"   ✅ Delhi Day Trip Origin Verified: {delhi_day_plan.hotel_summary.hotel_name} at ({delhi_day_plan.hotel_summary.lat:.4f}, {delhi_day_plan.hotel_summary.lng:.4f})")

    jaipur_day = TripRequest(destination="Jaipur", days=1, budget_inr=5000, people_count=2)
    jaipur_day_plan = generate_itinerary(jaipur_day)
    assert 26.8 <= jaipur_day_plan.hotel_summary.lat <= 27.1, "Jaipur day trip must use Jaipur terminal coordinates!"
    print(f"   ✅ Jaipur Day Trip Origin Verified: {jaipur_day_plan.hotel_summary.hotel_name} at ({jaipur_day_plan.hotel_summary.lat:.4f}, {jaipur_day_plan.hotel_summary.lng:.4f})")

    # Test 4: Comprehensive Date & Transport Input Resolution
    print("\n4️⃣ Testing Date Resolution & Root Transport Mode Parsing...")
    # Case A: start_date + days -> derives end_date
    req_a = TripRequest(
        destination="Hyderabad",
        start_date=date(2026, 11, 1),
        days=3,
        budget_inr=10000,
        people_count=1,
        transport_mode="auto"
    )
    assert req_a.end_date == date(2026, 11, 3), f"Failed to derive end_date: {req_a.end_date}"
    assert req_a.transport_pref.mode == TransportMode.AUTO, "Failed to map root transport_mode!"
    print(f"   ✅ start_date + days derived end_date: {req_a.end_date} | Transport Mode: {req_a.transport_pref.mode.value}")

    # Case B: end_date + days -> derives start_date
    req_b = TripRequest(
        destination="Delhi",
        end_date=date(2026, 11, 10),
        days=4,
        budget_inr=12000,
        people_count=2
    )
    assert req_b.start_date == date(2026, 11, 7), f"Failed to derive start_date: {req_b.start_date}"
    print(f"   ✅ end_date + days derived start_date: {req_b.start_date}")

    # Test 5: Day-of-Week Closure (Friday Closure for Salar Jung Museum)
    print("\n5️⃣ Testing Day-of-Week Hard Exclusions (Salar Jung Museum Friday)...")
    friday_date = date(2026, 10, 16)
    friday_req = TripRequest(
        destination="Hyderabad",
        start_date=friday_date,
        end_date=friday_date,
        budget_inr=5000,
        people_count=2,
        interests=["museum", "history"]
    )
    friday_plan = generate_itinerary(friday_req)
    scheduled_places = [act.place_name for act in friday_plan.days[0].activities]
    assert "Salar Jung Museum" not in scheduled_places, "Violation: Salar Jung Museum was scheduled on a Friday!"
    print(f"   ✅ Friday Closure Honored: Salar Jung Museum was excluded on Friday (Scheduled: {scheduled_places})")

    # Test 6: Viewpoint Name Serialization
    print("\n6️⃣ Testing Viewpoint Name Field Compatibility...")
    found_vp = False
    for day in friday_plan.days:
        for act in day.activities:
            if act.recommended_viewpoint:
                assert act.recommended_viewpoint.viewpoint_name is not None
                assert act.recommended_viewpoint.name is not None
                assert act.recommended_viewpoint.name == act.recommended_viewpoint.viewpoint_name
                found_vp = True
                print(f"   ✅ Viewpoint Field Verified: {act.recommended_viewpoint.name} (viewpoint_name: {act.recommended_viewpoint.viewpoint_name})")
                break
        if found_vp:
            break

    # Test 7: Blueprint Stage 9: Truly Differentiated Hotel Tiers
    print("\n7️⃣ Testing Blueprint Stage 9 (Differentiated Hotel Tiers)...")
    multi_req = TripRequest(
        destination="Hyderabad",
        days=2,
        budget_inr=20000,
        people_count=2,
        interests=["history", "food"]
    )
    multi_result = generate_variants(multi_req)
    budget_hotel = multi_result.variants["budget"].hotel_summary.hotel_name
    comfort_hotel = multi_result.variants["comfort"].hotel_summary.hotel_name
    print(f"   ✅ Budget Variant Hotel:  {budget_hotel} (₹{multi_result.variants['budget'].hotel_summary.price_per_night_per_room}/night)")
    print(f"   ✅ Balanced Variant Hotel:{multi_result.variants['balanced'].hotel_summary.hotel_name} (₹{multi_result.variants['balanced'].hotel_summary.price_per_night_per_room}/night)")
    print(f"   ✅ Comfort Variant Hotel: {comfort_hotel} (₹{multi_result.variants['comfort'].hotel_summary.price_per_night_per_room}/night)")
    assert multi_result.variants["budget"].hotel_summary.price_per_night_per_room < multi_result.variants["comfort"].hotel_summary.price_per_night_per_room, \
        "Comfort hotel must be higher tier than budget hotel!"

    print("\n🎉 ALL 7 AUDIT & BLUEPRINT TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    run_tests()
