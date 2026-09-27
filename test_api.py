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

    # Test 8: Origin Geocoding Precision (Airports & Hubs in All Cities)
    print("\n8️⃣ Testing Real Coordinates for Multi-City Origin Hubs...")
    from tripweave.geocoding import LocationResolver
    hyd_name, hyd_lat, hyd_lng = LocationResolver.resolve_origin("hyderabad", start_location="Airport")
    del_name, del_lat, del_lng = LocationResolver.resolve_origin("delhi", start_location="Airport")
    jai_name, jai_lat, jai_lng = LocationResolver.resolve_origin("jaipur", start_location="Airport")
    
    assert 17.20 <= hyd_lat <= 17.28, f"Hyderabad Airport lat wrong: {hyd_lat}"
    assert 28.50 <= del_lat <= 28.60, f"Delhi Airport lat wrong: {del_lat}"
    assert 26.80 <= jai_lat <= 26.86, f"Jaipur Airport lat wrong: {jai_lat}"
    print(f"   ✅ Real Origin Coordinates Verified:")
    print(f"      - Hyderabad: {hyd_name} ({hyd_lat:.4f}, {hyd_lng:.4f})")
    print(f"      - Delhi:     {del_name} ({del_lat:.4f}, {del_lng:.4f})")
    print(f"      - Jaipur:    {jai_name} ({jai_lat:.4f}, {jai_lng:.4f})")

    # Test 9: Data Freshness & Provenance Fields
    print("\n9️⃣ Testing Data Freshness & Verification Status on Activities...")
    sample_act = multi_result.variants["balanced"].days[0].activities[0]
    assert sample_act.verification_status in ["curated_seed", "verified"], "Activity must have valid provenance status"
    assert sample_act.last_verified_date is not None, "Activity must have last_verified_date"
    assert sample_act.source_reference is not None, "Activity must have source_reference"
    print(f"   ✅ Provenance Verified on '{sample_act.place_name}': {sample_act.verification_status} (Audited: {sample_act.last_verified_date}) - '{sample_act.source_reference}'")

    # Test 10: Stage 8 Independent Physics & Feasibility Verifier
    print("\n🔟 Testing Stage 8 Independent Physics & Feasibility Verifier...")
    ver_rep = multi_result.variants["balanced"].verification_report
    assert ver_rep is not None, "Verification report must be present on TripPlan"
    assert ver_rep.is_valid is True, f"Plan failed independent verification: {ver_rep.errors}"
    assert ver_rep.audit_score >= 80, f"Audit score too low: {ver_rep.audit_score}"
    assert len(ver_rep.checks_passed) >= 3, "Must have passed core validation checks"
    assert any("Reconciled" in chk for chk in ver_rep.checks_passed), "Must reconcile transport and grand total"
    print(f"   ✅ Verification Report: Score {ver_rep.audit_score}/100 | Status: {'VALID' if ver_rep.is_valid else 'INVALID'}")
    print(f"      Metrics: {ver_rep.metrics}")
    print(f"      Checks Passed: {ver_rep.checks_passed}")

    # Test 11: In-Solver Budget Dimension (Optimizer naturally prunes to stay within cap)
    print("\n1️⃣1️⃣ Testing In-Solver Budget Dimension under Tight Budget...")
    tight_req = TripRequest(
        destination="Hyderabad",
        days=1,
        budget_inr=1500,
        people_count=1,
        transport_mode="auto"
    )
    tight_plan = generate_itinerary(tight_req)
    assert tight_plan.total_cost_inr <= 1500, f"Plan cost ₹{tight_plan.total_cost_inr} exceeded tight budget ₹1500!"
    assert tight_plan.verification_report.is_valid is True

    # Test 12: Stage 7 Physical Exertion & Fatigue Analytics
    print("\n1️⃣2️⃣ Testing Stage 7 Fatigue & Pace Engine...")
    assert tight_plan.fatigue_report is not None, "TripPlan must have fatigue_report"
    assert "trip_fatigue_score" in tight_plan.fatigue_report
    assert tight_plan.days[0].fatigue_score is not None
    assert tight_plan.days[0].fatigue_level is not None
    print(f"   ✅ Fatigue Analytics Verified: Score {tight_plan.fatigue_report['trip_fatigue_score']}/100 ({tight_plan.fatigue_report['overall_pace']}) | Day 1: {tight_plan.days[0].fatigue_level} ({tight_plan.days[0].fatigue_score}/100)")

    # Test 13: Strict Budget Guardrail Rejection on Impossible Budget
    print("\n1️⃣3️⃣ Testing Strict Budget Guardrail on Infeasible Budget...")
    impossible_req = TripRequest(
        destination="Hyderabad",
        days=2,
        budget_inr=500,  # Impossible for 2 days + hotel stay
        people_count=2,
        transport_mode="cab"
    )
    caught_guard = False
    try:
        generate_itinerary(impossible_req)
    except HTTPException as e:
        caught_guard = True
        print(f"   ✅ Infeasible Budget Successfully Blocked by Guardrail: {e.detail}")
    assert caught_guard, "Expected HTTPException 422 for budget violation!"

    # Test 14: Strict Transport Budget Cap Enforcement
    print("\n1️⃣4️⃣ Testing Strict Transport Budget Cap Enforcement...")
    transport_cap_req = TripRequest(
        destination="Hyderabad",
        days=1,
        budget_inr=15000,
        people_count=1,
        transport_mode="cab",
        transport_pref=TransportPreference(mode=TransportMode.CAB, max_budget_inr=300)
    )
    cap_plan = generate_itinerary(transport_cap_req)
    assert cap_plan.estimated_transport_cost_inr <= 300, f"Transport cost ₹{cap_plan.estimated_transport_cost_inr} exceeded cap ₹300!"
    assert cap_plan.verification_report.is_valid is True, f"Verifier flagged valid capped plan: {cap_plan.verification_report.errors}"
    assert any("Transport Cap Verified" in chk for chk in cap_plan.verification_report.checks_passed)
    print(f"   ✅ Transport Cap Strictly Enforced: ₹{cap_plan.estimated_transport_cost_inr} <= ₹300 limit")

    # Test 15: Astronomical Golden Hour Uses Exact Trip Date
    print("\n1️⃣5️⃣ Testing Date-Specific NOAA Sunset Shift (June vs Dec)...")
    gh_june_start, sunset_june = get_golden_hour_window(17.3850, 78.4867, target_date=date(2026, 6, 21))
    gh_dec_start, sunset_dec = get_golden_hour_window(17.3850, 78.4867, target_date=date(2026, 12, 21))
    # In Hyderabad, summer solstice sunset (~18:50 IST = 650m) is ~1 hr later than winter solstice (~17:45 IST = 585m)
    assert sunset_june > sunset_dec + 45, f"Expected summer sunset to be at least 45m later than winter! June: {sunset_june}m, Dec: {sunset_dec}m"
    print(f"   ✅ Astronomical Shift Verified: June Sunset {sunset_june}m from 8am vs Dec Sunset {sunset_dec}m from 8am (Δ = {sunset_june - sunset_dec} mins)")

    # Test 16: Verifier Audits Full Day Schedule & Hotel Return Commute
    print("\n1️⃣6️⃣ Testing Full Physical Schedule & Daily Hotel Return Commute...")
    ver_metrics = cap_plan.verification_report.metrics
    assert "total_transit_km" in ver_metrics
    assert cap_plan.verification_report.is_valid is True
    assert "Transit Physics: Routes physically feasible with realistic traffic speeds." in cap_plan.verification_report.checks_passed
    print(f"   ✅ Full Day Schedule Audited: Transit {ver_metrics['total_transit_km']} across all daily return commutes.")

    print("\n🎉 ALL 16 COMPREHENSIVE VERIFICATION & ENGINE TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    run_tests()
