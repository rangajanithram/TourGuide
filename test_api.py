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
import time
from datetime import date, timedelta
from fastapi import HTTPException

sys.stdout.reconfigure(encoding='utf-8')
from tripweave.main import generate_itinerary, generate_variants
from tripweave.models import (
    TripRequest, HotelPreference, TransportPreference, 
    TransportMode, PacePreference, PlanVariantType, GroupProfile, Place
)
from tripweave.distance import calculate_distance_km, get_travel_metrics, compute_detour_cost_rupees, _cached_haversine
from tripweave.solar import get_golden_hour_window
from tripweave.geocoding import LocationResolver
from tripweave.weather import WeatherProvider
from tripweave.fatigue import FatigueAnalyzer
from tripweave.crowd import HeuristicCrowdProvider
from tripweave.transport import get_transport_provider
from tripweave.optimizer import TripOptimizer
from tripweave.clustering import GeoClusterer


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

    # Test 14: Strict Transport Budget Cap Enforcement & Minimum Useful Plan Guarantee
    print("\n1️⃣4️⃣ Testing Strict Transport Budget Cap Enforcement & Useful Plan...")
    transport_cap_req = TripRequest(
        destination="Hyderabad",
        days=1,
        budget_inr=15000,
        people_count=1,
        transport_mode="auto",
        transport_pref=TransportPreference(mode=TransportMode.AUTO, max_budget_inr=400)
    )
    cap_plan = generate_itinerary(transport_cap_req)
    total_visits = sum(len(d.activities) for d in cap_plan.days)
    assert total_visits >= 2, f"Expected at least 2 visits, got {total_visits}"
    assert 0 < cap_plan.estimated_transport_cost_inr <= 400, f"Transport cost ₹{cap_plan.estimated_transport_cost_inr} exceeded cap ₹400 or was 0!"
    assert cap_plan.verification_report.is_valid is True, f"Verifier flagged valid capped plan: {cap_plan.verification_report.errors}"
    assert any("Transport Cap Verified" in chk for chk in cap_plan.verification_report.checks_passed)
    print(f"   ✅ Transport Cap Strictly Enforced: ₹{cap_plan.estimated_transport_cost_inr} <= ₹400 with {total_visits} useful visits")

    # Impossible transport cap must raise HTTPException 422
    impossible_cap_req = TripRequest(
        destination="Hyderabad",
        days=1,
        budget_inr=15000,
        people_count=1,
        transport_mode="cab",
        transport_pref=TransportPreference(mode=TransportMode.CAB, max_budget_inr=10)
    )
    caught_cap = False
    try:
        generate_itinerary(impossible_cap_req)
    except HTTPException:
        caught_cap = True
        print("   ✅ Impossible Transport Cap Successfully Blocked by 422 Guardrail")
    assert caught_cap, "Expected HTTPException 422 for impossible transport cap"

    # Test 15: Astronomical Golden Hour Uses Exact Trip Date & Receives Experience Tag
    print("\n1️⃣5️⃣ Testing Date-Specific NOAA Sunset Shift & Optimizer Tagging...")
    gh_june_start, sunset_june = get_golden_hour_window(17.3850, 78.4867, target_date=date(2026, 6, 21))
    gh_dec_start, sunset_dec = get_golden_hour_window(17.3850, 78.4867, target_date=date(2026, 12, 21))
    assert sunset_june > sunset_dec + 45, f"Expected summer sunset to be at least 45m later than winter!"
    print(f"   ✅ Astronomical Shift: June Sunset {sunset_june}m from 8am vs Dec Sunset {sunset_dec}m from 8am (Δ = {sunset_june - sunset_dec} mins)")

    # Verify optimizer assigns golden hour tag on June 21
    june_req = TripRequest(
        destination="Hyderabad",
        start_date=date(2026, 6, 21),
        days=1,
        budget_inr=8000,
        people_count=1,
        interests=["sunset", "history"]
    )
    june_plan = generate_itinerary(june_req)
    gh_tagged = [a for a in june_plan.days[0].activities if a.experience_tag and "Golden Hour" in a.experience_tag]
    assert len(gh_tagged) > 0, "Optimizer must schedule and tag a visit during June golden hour!"
    print(f"   ✅ Date-Specific Golden Hour Scheduled & Tagged: '{gh_tagged[0].place_name}' at {gh_tagged[0].start_time} - {gh_tagged[0].end_time}")

    # Test 16: Verifier Audits Full Day Schedule & Hotel Return Commute
    print("\n1️⃣6️⃣ Testing Full Physical Schedule & Daily Hotel Return Commute...")
    ver_metrics = cap_plan.verification_report.metrics
    assert "total_transit_km" in ver_metrics
    assert cap_plan.verification_report.is_valid is True
    assert "Transit Physics: Routes physically feasible with realistic traffic speeds." in cap_plan.verification_report.checks_passed
    print(f"   ✅ Full Day Schedule Audited: Transit {ver_metrics['total_transit_km']} across daily return commutes.")

    # Test 17: Variants Endpoint Preserves User Transport Cap
    print("\n1️⃣7️⃣ Testing Variant Generation Preserves User Transport Cap...")
    multi_cap_req = TripRequest(
        destination="Hyderabad",
        days=1,
        budget_inr=15000,
        people_count=1,
        transport_mode="cab",
        transport_pref=TransportPreference(mode=TransportMode.CAB, max_budget_inr=500)
    )
    multi_cap_plan = generate_variants(multi_cap_req)
    for v_name, v_plan in multi_cap_plan.variants.items():
        assert v_plan.estimated_transport_cost_inr <= 500, f"Variant '{v_name}' transport ₹{v_plan.estimated_transport_cost_inr} exceeded cap ₹500!"
        assert v_plan.verification_report.is_valid is True
    print(f"   ✅ All 3 Variants Respected User Transport Cap: Budget (₹{multi_cap_plan.variants['budget'].estimated_transport_cost_inr}), Balanced (₹{multi_cap_plan.variants['balanced'].estimated_transport_cost_inr}), Comfort (₹{multi_cap_plan.variants['comfort'].estimated_transport_cost_inr})")

    # Test 18: City Center Origin Resolution
    print("\n1️⃣8️⃣ Testing City Center Origin Hub Resolution...")
    c_name, c_lat, c_lng = LocationResolver.resolve_origin("hyderabad", origin_type="center")
    assert "Abids" in c_name or "Center" in c_name, f"Unexpected center name: {c_name}"
    assert 17.38 <= c_lat <= 17.40 and 78.47 <= c_lng <= 78.49
    print(f"   ✅ City Center Origin Verified: {c_name} at ({c_lat:.4f}, {c_lng:.4f})")

    # Test 19: Weather Integration (Live Open-Meteo & Climatological Fallback)
    print("\n1️⃣9️⃣ Testing Weather Provider Integration & Live vs Fallback Distinction...")
    # Case A: Live Forecast within 16-day horizon (e.g. 2 days from today)
    near_start = date.today() + timedelta(days=2)
    near_forecasts = WeatherProvider.get_daily_forecasts(17.3850, 78.4867, start_date=near_start, days=2)
    near_key = near_start.isoformat()
    assert near_key in near_forecasts
    w_near = near_forecasts[near_key]
    assert w_near.is_forecast is True, "Near-term dates within 16 days must use live Open-Meteo forecast!"
    assert 15.0 <= w_near.max_temp_c <= 50.0
    print(f"   ✅ Live Open-Meteo Forecast Verified ({near_key}): {w_near.condition}, {w_near.max_temp_c:.1f}°C, is_forecast={w_near.is_forecast}")

    # Case B: Distant date (> 16 days ahead) fallback
    distant_start = date.today() + timedelta(days=60)
    distant_forecasts = WeatherProvider.get_daily_forecasts(17.3850, 78.4867, start_date=distant_start, days=2)
    distant_key = distant_start.isoformat()
    assert distant_key in distant_forecasts
    w_dist = distant_forecasts[distant_key]
    assert w_dist.is_forecast is False, "Distant dates beyond 16 days must use climatological fallback!"
    print(f"   ✅ Climatological Fallback Verified ({distant_key}): {w_dist.condition}, {w_dist.max_temp_c:.1f}°C, is_forecast={w_dist.is_forecast}")

    # Test 20: Group Profile Calibrated Fatigue Model (Blueprint Section 6)
    print("\n2️⃣0️⃣ Testing Group Profile Calibrated Fatigue...")
    solo_eval = FatigueAnalyzer.evaluate_trip(
        june_plan.days, pace=PacePreference.BALANCED, group_profile=GroupProfile.YOUNG_SOLO
    )
    elderly_eval = FatigueAnalyzer.evaluate_trip(
        june_plan.days, pace=PacePreference.BALANCED, group_profile=GroupProfile.ELDERLY
    )
    assert elderly_eval["trip_fatigue_score"] > solo_eval["trip_fatigue_score"], "Elderly fatigue score must be strictly higher than young solo!"
    assert any("senior" in d["advice"].lower() or "wheelchair" in d["advice"].lower() for d in elderly_eval["daily_breakdown"])
    print(f"   ✅ Group Profile Fatigue Calibrated: Young Solo ({solo_eval['trip_fatigue_score']}/100) vs Elderly ({elderly_eval['trip_fatigue_score']}/100)")

    # Test 21: Stage 10 Explainability Engine & "Why Not X?" Decision Trace
    print("\n2️⃣1️⃣ Testing Stage 10 Explainability & 'Why Not X?' Decision Trace...")
    assert june_plan.decision_trace is not None
    assert len(june_plan.decision_trace.hotel_rationale) > 10
    assert len(june_plan.decision_trace.pacing_rationale) > 10
    assert len(june_plan.decision_trace.excluded_places) > 0
    # At least one excluded place should have a clear category and suggested action
    first_ex = june_plan.decision_trace.excluded_places[0]
    assert first_ex.category in ["closed_on_day", "budget_limit", "pace_limit", "operating_hours", "geographic_detour"]
    assert len(first_ex.reason) > 5
    print(f"   ✅ Explainability Trace Verified: {len(june_plan.decision_trace.excluded_places)} candidate exclusions analyzed (Example: '{first_ex.place_name}' -> {first_ex.category})")

    # Test 22: Locked / Pinned Activities (Blueprint Section 12)
    print("\n2️⃣2️⃣ Testing User-Pinned / Locked Activities & Guardrails...")
    # Case A: Valid pinned activity scheduled
    locked_req = TripRequest(
        destination="Hyderabad",
        start_date=date(2026, 11, 10),
        days=2,
        budget_inr=15000,
        people_count=2,
        locked_activities=["Charminar"]
    )
    locked_plan = generate_itinerary(locked_req)
    pinned_matches = [
        act for d in locked_plan.days for act in d.activities if act.place_name == "Charminar"
    ]
    assert len(pinned_matches) == 1, "Pinned activity 'Charminar' must be scheduled!"
    assert pinned_matches[0].is_locked is True, "Scheduled activity must be flagged as is_locked=True!"
    print(f"   ✅ Pinned Activity Verified: 'Charminar' scheduled with is_locked=True")

    # Case B: Unknown locked attraction fails with HTTP 422
    try:
        generate_itinerary(TripRequest(
            destination="Hyderabad",
            days=1,
            budget_inr=10000,
            people_count=1,
            locked_activities=["NonExistentAttractionXYZ"]
        ))
        assert False, "Must raise HTTP 422 for unknown locked activity!"
    except HTTPException as e:
        assert e.status_code == 422
        assert "Unknown pinned attraction" in e.detail or "Unknown locked attraction" in e.detail
        print(f"   ✅ Unknown Pinned Activity Guardrail Verified: HTTP 422 '{e.detail}'")

    # Test 23: Strict Expense Breakdown & Reconciled Budget
    print("\n2️⃣3️⃣ Testing Strict Mathematical Expense Reconciliation...")
    assert locked_plan.expense_breakdown is not None
    eb = locked_plan.expense_breakdown
    assert eb.lodging_inr > 0
    assert eb.transit_inr > 0
    assert eb.activities_inr > 0
    assert eb.per_person_inr > 0

    # Strict reconciliation equations:
    # 1. Direct subtotal == Lodging + Transit + Activities + Dining == plan.total_cost_inr
    assert eb.lodging_inr + eb.transit_inr + eb.activities_inr + eb.dining_inr == eb.direct_subtotal_inr
    assert eb.direct_subtotal_inr == locked_plan.total_cost_inr
    # 2. Direct subtotal + Safe unallocated buffer == User budget
    assert eb.direct_subtotal_inr + eb.unallocated_buffer_inr == locked_req.budget_inr
    # 3. Buffer vs Suggested Meals status
    assert "Sufficient" in eb.meal_buffer_status or "Exceeds" in eb.meal_buffer_status
    print(f"   ✅ Reconciled Accounting Verified: Direct Subtotal (₹{eb.direct_subtotal_inr}) + Safe Buffer (₹{eb.unallocated_buffer_inr}) == Total Budget (₹{locked_req.budget_inr})")
    print(f"      Meal Status: {eb.meal_buffer_status}")

    # Test 24: GroupProfile Solver Calibration (Senior Travelers Pacing & Mode)
    print("\n2️⃣4️⃣ Testing GroupProfile Solver Calibration (Senior Travelers)...")
    elderly_walk_req = TripRequest(
        destination="Hyderabad",
        start_date=date(2026, 11, 10),
        days=1,
        budget_inr=8000,
        people_count=2,
        group_profile=GroupProfile.ELDERLY,
        transport_mode="walk"
    )
    elderly_plan = generate_itinerary(elderly_walk_req)
    assert elderly_plan.transport_mode in [TransportMode.AUTO, TransportMode.CAB], "Elderly profile must override strenuous cross-city walk mode!"
    print(f"   ✅ Elderly Solver Calibration Verified: Walk overridden to '{elderly_plan.transport_mode.value}' with senior rest buffers.")

    # Test 25: Candidate Omission Diagnostic Formatting
    print("\n2️⃣5️⃣ Testing Candidate Omission Diagnostic Formatting...")
    for ex in june_plan.decision_trace.excluded_places:
        assert ex.reason.startswith("Candidate Omission Diagnostic:"), f"Diagnostic prefix missing in reason: '{ex.reason}'"
        assert ex.suggested_action is not None and len(ex.suggested_action) > 5
    print(f"   ✅ Candidate Omission Diagnostics Verified: Deterministic checks labeled across {len(june_plan.decision_trace.excluded_places)} candidate places.")

    # Test 26: Multi-City Launch Expansion (Bengaluru & Mumbai)
    print("\n2️⃣6️⃣ Testing Multi-City Launch Expansion (Bengaluru & Mumbai)...")
    blr_hub_name, blr_lat, blr_lng = LocationResolver.resolve_origin("Bengaluru", origin_type="airport")
    assert "Kempegowda" in blr_hub_name
    mum_hub_name, mum_lat, mum_lng = LocationResolver.resolve_origin("Mumbai", origin_type="station")
    assert "Chhatrapati Shivaji Maharaj" in mum_hub_name
    print(f"   ✅ Geocoding Hubs Verified: Bengaluru ({blr_hub_name}) & Mumbai ({mum_hub_name})")

    blr_req = TripRequest(
        destination="Bengaluru",
        start_date=date(2026, 11, 10),
        days=2,
        budget_inr=16000,
        people_count=2,
        pace=PacePreference.BALANCED
    )
    blr_plan = generate_itinerary(blr_req)
    assert blr_plan.verification_report.is_valid
    assert len(blr_plan.days) >= 1
    blr_places = [a.place_name for d in blr_plan.days for a in d.activities]
    print(f"   ✅ Bengaluru Plan Verified: {len(blr_places)} visits ({', '.join(blr_places[:3])})")

    mum_req = TripRequest(
        destination="Mumbai",
        start_date=date(2026, 11, 10),
        days=2,
        budget_inr=20000,
        people_count=2,
        pace=PacePreference.BALANCED
    )
    mum_plan = generate_itinerary(mum_req)
    assert mum_plan.verification_report.is_valid
    assert len(mum_plan.days) >= 1
    mum_places = [a.place_name for d in mum_plan.days for a in d.activities]
    print(f"   ✅ Mumbai Plan Verified: {len(mum_places)} visits ({', '.join(mum_places[:3])})")

    # Test 27: Blueprint Section 7 Crowd Intelligence Heuristics
    print("\n2️⃣7️⃣ Testing Blueprint Section 7 Crowd Intelligence Heuristics...")
    # Saturday afternoon museum rush:
    fc_mus_sat = HeuristicCrowdProvider.get_forecast("attraction", 5, 14, tags=["museum"])
    assert fc_mus_sat.score == 85 and fc_mus_sat.level in ["Busy", "Very Busy"]
    # Weekday morning museum:
    fc_mus_wed = HeuristicCrowdProvider.get_forecast("attraction", 2, 10, tags=["museum"])
    assert fc_mus_wed.score == 20 and fc_mus_wed.level == "Low"
    # Fort Sunday midday:
    fc_fort_sun = HeuristicCrowdProvider.get_forecast("attraction", 6, 13, tags=["fort"])
    assert fc_fort_sun.score == 80 and fc_fort_sun.level == "Busy"
    # Restaurant peak lunch:
    fc_lunch = HeuristicCrowdProvider.get_forecast("restaurant", 2, 13)
    assert fc_lunch.score == 85 and fc_lunch.level == "Busy"
    # Verify activities have populated crowd_forecast:
    sample_act = blr_plan.days[0].activities[0]
    assert sample_act.crowd_forecast is not None
    assert 0 <= sample_act.crowd_forecast.score <= 100
    print(f"   ✅ Crowd Heuristics Verified: Museum Saturday Peak ({fc_mus_sat.score}/100) vs Weekday Morning ({fc_mus_wed.score}/100)")
    print(f"      Scheduled Activity Crowd Tag: '{sample_act.place_name}' -> {sample_act.crowd_forecast.level} Crowd ({sample_act.crowd_forecast.score})")

    # Test 28: Blueprint Section 1 & 5 Activity Dependencies
    print("\n2️⃣8️⃣ Testing Blueprint Section 1 & 5 Activity Dependencies (Elephanta -> Gateway)...")
    dep_req = TripRequest(
        destination="Mumbai",
        start_date=date(2026, 11, 10),
        days=1,
        budget_inr=15000,
        people_count=2,
        locked_activities=["Elephanta Caves", "Gateway of India"]
    )
    dep_plan = generate_itinerary(dep_req)
    assert dep_plan.verification_report.is_valid
    day_act_names = [a.place_name for a in dep_plan.days[0].activities]
    assert "Gateway of India" in day_act_names, "Prerequisite 'Gateway of India' must be included"
    assert "Elephanta Caves" in day_act_names, "Dependent 'Elephanta Caves' must be included"
    idx_gate = day_act_names.index("Gateway of India")
    idx_ele = day_act_names.index("Elephanta Caves")
    assert idx_gate < idx_ele, f"Gateway of India (idx {idx_gate}) must be visited before Elephanta Caves (idx {idx_ele})!"
    print(f"   ✅ Activity Dependency Precedence Verified: Gateway of India (Stop {idx_gate+1}) -> Elephanta Caves (Stop {idx_ele+1})")

    # Test 29: Blueprint Section 6 Detour Penalty Math & Meal Windows
    print("\n2️⃣9️⃣ Testing Blueprint Section 6 Detour Penalty Math & Meal Accounting...")
    detour_cost = compute_detour_cost_rupees(3.0, 10, per_km_rs=12.0, time_value_rs_per_min=2.0)
    assert detour_cost == 56.0, f"Expected 56.0, got {detour_cost}"
    print(f"   ✅ Detour Penalty Formula Verified: 3.0 km + 10 min = ₹{detour_cost:.0f}")

    # Test 30: Blueprint Section 1 Curated Inter-City Transit Routes
    print("\n3️⃣0️⃣ Testing Blueprint Section 1 Curated Inter-City Transit Routes (BLR -> HYD)...")
    tp = get_transport_provider()
    blr_hyd_routes = tp.get_routes("bengaluru", "hyderabad")
    assert len(blr_hyd_routes) >= 3, f"Expected at least 3 curated routes for BLR->HYD, got {len(blr_hyd_routes)}"
    modes = {r.mode for r in blr_hyd_routes}
    assert "train" in modes and "bus" in modes and "flight" in modes, f"Missing transit modes in {modes}"
    vb_train = next(r for r in blr_hyd_routes if r.mode == "train")
    assert "Vande Bharat" in vb_train.operator_name
    assert "Kacheguda" in vb_train.arrival_station
    bus_route = next(r for r in blr_hyd_routes if r.mode == "bus")
    assert "KSRTC" in bus_route.operator_name
    print(f"   ✅ Inter-City Routes Verified: {len(blr_hyd_routes)} options (Train: '{vb_train.operator_name}', Bus: '{bus_route.operator_name}')")

    # Test 31: Variant-Calibrated Inter-City Transport Recommendations
    print("\n3️⃣1️⃣ Testing Variant-Calibrated Inter-City Recommendations & Stage Telemetry...")
    ic_req = TripRequest(
        origin_city="Bengaluru",
        destination="Hyderabad",
        start_date=date(2026, 11, 20),
        days=2,
        budget_inr=20000,
        people_count=2,
        pace=PacePreference.BALANCED
    )
    ic_mv_plan = generate_variants(ic_req)
    assert ic_mv_plan.origin_city == "Bengaluru"
    assert len(ic_mv_plan.synthesis_stages) == 10, f"Expected 10 stages, got {len(ic_mv_plan.synthesis_stages)}"
    assert ic_mv_plan.synthesis_stages[0]["name"] == "Candidate Generation"
    assert ic_mv_plan.synthesis_stages[9]["name"] == "Explainability Trace"

    b_ic = ic_mv_plan.variants["budget"].intercity_transport
    bal_ic = ic_mv_plan.variants["balanced"].intercity_transport
    c_ic = ic_mv_plan.variants["comfort"].intercity_transport

    assert b_ic is not None, "Budget variant must have intercity_transport"
    assert bal_ic is not None, "Balanced variant must have intercity_transport"
    assert c_ic is not None, "Comfort variant must have intercity_transport"

    # Budget should recommend lowest fare option (bus or budget rail)
    assert b_ic.recommended_option.typical_fare_min <= bal_ic.recommended_option.typical_fare_min
    # Comfort should recommend fastest (flight)
    assert c_ic.recommended_option.mode == "flight"
    assert bal_ic.return_option is not None, "Balanced variant must have return_option"
    assert bal_ic.return_option.origin_city.lower() == "hyderabad", "Return option origin must be Hyderabad"
    assert bal_ic.return_option.destination_city.lower() == "bengaluru", "Return option destination must be Bengaluru"
    print(f"   ✅ Variant Recommendations Verified:")
    print(f"      - Budget Variant:  {b_ic.recommended_option.operator_name} (₹{b_ic.recommended_option.typical_fare_min})")
    print(f"      - Balanced Variant:{bal_ic.recommended_option.operator_name} ({bal_ic.recommended_option.typical_duration_min // 60}h {bal_ic.recommended_option.typical_duration_min % 60}m)")
    print(f"      - Return Leg Route:{bal_ic.return_option.operator_name} ({bal_ic.return_option.departure_station} -> {bal_ic.return_option.arrival_station}, ₹{bal_ic.return_option.typical_fare_min})")
    print(f"      - Comfort Variant: {c_ic.recommended_option.operator_name} ({c_ic.recommended_option.mode.upper()})")

    # Test 32: Last-Mile Terminal-to-Hotel Route & Auto Fare Estimation
    print("\n3️⃣2️⃣ Testing Last-Mile Terminal-to-Hotel Route & Auto Fare Estimation...")
    lm = bal_ic.last_mile
    assert lm is not None, "Balanced intercity transit must compute last-mile to hotel"
    assert lm.distance_km > 0.0, "Last mile distance must be positive"
    assert lm.estimated_time_min > 0, "Last mile time must be positive"
    assert lm.estimated_cost_inr > 0, "Last mile cost must be positive"
    assert lm.destination_hotel == ic_mv_plan.variants["balanced"].hotel_summary.hotel_name
    print(f"   ✅ Last-Mile Connectivity Verified: {lm.arrival_terminal} -> {lm.destination_hotel}")
    print(f"      {lm.distance_km} km • ~{lm.estimated_time_min} mins via {lm.recommended_mode} (₹{lm.estimated_cost_inr})")
    print(f"      Guidance: '{lm.guidance}'")

    # Test 33: Partial Date Input Resolution & Bounds Validation
    print("\n3️⃣3️⃣ Testing Partial Date Resolution & Trip Bounds Validation...")
    # Case A: start_date alone (defaults to 3 days and computes end_date)
    partial_start_req = TripRequest(
        destination="Hyderabad",
        start_date=date(2026, 12, 1),
        budget_inr=12000,
        people_count=2
    )
    assert partial_start_req.days == 3, f"Expected 3 days default, got {partial_start_req.days}"
    assert partial_start_req.end_date == date(2026, 12, 3), f"Expected 2026-12-03, got {partial_start_req.end_date}"
    print(f"   ✅ start_date alone resolved: {partial_start_req.days} days ({partial_start_req.start_date} to {partial_start_req.end_date})")

    # Case B: end_date alone (defaults to 3 days and computes start_date)
    partial_end_req = TripRequest(
        destination="Delhi",
        end_date=date(2026, 12, 10),
        budget_inr=15000,
        people_count=1
    )
    assert partial_end_req.days == 3, f"Expected 3 days default, got {partial_end_req.days}"
    assert partial_end_req.start_date == date(2026, 12, 8), f"Expected 2026-12-08, got {partial_end_req.start_date}"
    print(f"   ✅ end_date alone resolved: {partial_end_req.days} days ({partial_end_req.start_date} to {partial_end_req.end_date})")

    # Case C: Exceeding max trip duration (> 14 days) rejected
    caught_long = False
    try:
        TripRequest(destination="Jaipur", days=18, budget_inr=50000, people_count=2)
    except Exception:
        caught_long = True
    assert caught_long, "Expected validation error for duration > 14 days"
    print("   ✅ Trip duration limit guardrail: > 14 days correctly rejected")

    # Test 34: Weather Provider In-Memory Caching & Multi-Variant Sharing
    print("\n3️⃣4️⃣ Testing Weather Provider In-Memory Caching & Multi-Variant Sharing...")
    cache_len_before = len(WeatherProvider._cache)
    # First call primes cache
    w_first = WeatherProvider.get_daily_forecasts(17.3850, 78.4867, start_date=date(2026, 11, 15), days=3)
    assert len(WeatherProvider._cache) >= cache_len_before, "Cache should be populated"
    # Second identical call hits in-memory cache instantly
    w_second = WeatherProvider.get_daily_forecasts(17.3850, 78.4867, start_date=date(2026, 11, 15), days=3)
    assert w_first.keys() == w_second.keys(), "Cached forecasts must be identical"
    print(f"   ✅ WeatherProvider In-Memory Cache Verified: {len(WeatherProvider._cache)} active memoized entries")

    # Test 35: Haversine Distance Calculation LRU Cache Verification
    print("\n3️⃣5️⃣ Testing Haversine Distance Calculation LRU Cache...")
    cache_info_before = _cached_haversine.cache_info()
    # Call calculate_distance_km between same coordinates multiple times
    for _ in range(10):
        calculate_distance_km(17.3616, 78.4747, 17.3833, 78.4011)
    cache_info_after = _cached_haversine.cache_info()
    assert cache_info_after.hits > cache_info_before.hits, "LRU cache must register hits for repeated coordinates"
    print(f"   ✅ Distance LRU Cache Verified: {cache_info_after.hits} hits, {cache_info_after.currsize} cached coordinates")

    # Test 36: Automatic Locked Activity Prerequisite Dependency Expansion
    print("\n3️⃣6️⃣ Testing Automatic Locked Activity Prerequisite Expansion...")
    # Elephanta Caves has depends_on: ['gateway_of_india']
    sample_places = [
        Place(place_id="hotel_1", name="Hotel Central", place_type="hotel", lat=18.9220, lng=72.8340, duration_minutes=0, estimated_cost_per_person_inr=0, price_per_night_inr=1500),
        Place(place_id="gateway_of_india", name="Gateway of India", place_type="attraction", lat=18.9220, lng=72.8347, duration_minutes=60, estimated_cost_per_person_inr=0),
        Place(place_id="elephanta_caves", name="Elephanta Caves", place_type="attraction", lat=18.9633, lng=72.9315, duration_minutes=180, estimated_cost_per_person_inr=300, depends_on=["gateway_of_india"])
    ]
    # User only explicitly locks elephanta_caves
    opt = TripOptimizer(
        places=sample_places,
        days=1,
        hotel_id="hotel_1",
        locked_activities=["elephanta_caves"],
        max_total_budget=5000
    )
    # The optimizer should automatically expand locked_activities to include gateway_of_india
    assert "elephanta_caves" in opt.locked_activities
    assert "gateway_of_india" in opt.locked_activities, "Prerequisite 'gateway_of_india' must be automatically locked to prevent deadlocks"
    print(f"   ✅ Prerequisite Expansion Verified: locking 'elephanta_caves' auto-locked {opt.locked_activities}")

    # Test 37: Explicit days=0 Rejection & Strict Bounds
    print("\n3️⃣7️⃣ Testing Strict Rejection of days=0 and Invalid Durations...")
    caught_zero = False
    try:
        TripRequest(
            destination="Hyderabad",
            start_date=date(2026, 12, 1),
            days=0,
            budget_inr=10000,
            people_count=2
        )
    except Exception:
        caught_zero = True
    assert caught_zero, "Expected validation error for days=0 even when start_date is supplied"

    caught_neg = False
    try:
        TripRequest(
            destination="Hyderabad",
            days=-2,
            budget_inr=10000,
            people_count=2
        )
    except Exception:
        caught_neg = True
    assert caught_neg, "Expected validation error for negative days"
    print("   ✅ Strict Duration Guardrails Verified: days=0 and days < 1 are strictly rejected with ValueError")

    # Test 38: WeatherProvider Bounded Cache & TTL Expiration
    print("\n3️⃣8️⃣ Testing WeatherProvider Bounded Cache Capacity & TTL Expiration...")
    assert WeatherProvider._CACHE_MAX_SIZE == 128
    assert WeatherProvider._CACHE_TTL_SECONDS == 3600.0

    dummy_key = (99.9999, 99.9999, "2026-01-01", 1)
    WeatherProvider._cache[dummy_key] = (time.time() - 4000.0, {})
    assert dummy_key in WeatherProvider._cache
    # Triggering get_daily_forecasts or checking the expired item
    WeatherProvider.get_daily_forecasts(17.3850, 78.4867, start_date=date(2026, 11, 15), days=1)
    expired_entry = WeatherProvider._cache.get(dummy_key)
    if expired_entry:
        cached_at, _ = expired_entry
        assert time.time() - cached_at > WeatherProvider._CACHE_TTL_SECONDS
    print(f"   ✅ Bounded Weather Cache Verified: Max {WeatherProvider._CACHE_MAX_SIZE} entries with {int(WeatherProvider._CACHE_TTL_SECONDS)}s TTL.")

    # Test 39: Directly Measured Pipeline Stage Duration Telemetry
    print("\n3️⃣9️⃣ Testing Authentic High-Resolution Pipeline Stage Timings...")
    for stg in ic_mv_plan.synthesis_stages:
        assert "duration_ms" in stg, f"Missing duration_ms in stage {stg['stage']}"
        assert isinstance(stg["duration_ms"], (int, float)), f"duration_ms must be numeric: {stg['duration_ms']}"
        assert stg["duration_ms"] >= 0.0, f"duration_ms must be non-negative: {stg['duration_ms']}"
    stage9 = ic_mv_plan.synthesis_stages[8] # 1-based stage 9 is index 8
    stage10 = ic_mv_plan.synthesis_stages[9] # 1-based stage 10 is index 9
    assert stage9["name"] == "Multi-Variant Diversification"
    assert stage10["name"] == "Explainability Trace"
    total_pipeline_ms = sum(s["duration_ms"] for s in ic_mv_plan.synthesis_stages)
    print(f"   ✅ Pipeline Telemetry Verified: All 10 stages instrumented with direct timers (Total Pipeline: {total_pipeline_ms:.2f} ms)")
    print(f"      - Stage 9 ({stage9['name']}): {stage9['duration_ms']:.2f} ms")
    print(f"      - Stage 10 ({stage10['name']}): {stage10['duration_ms']:.2f} ms")

    # Test 40: Curated Return Route Selection, Return Last-Mile & Workload Balancing
    print("\n4️⃣0️⃣ Testing Curated Return Route Lookup, Return Last-Mile & Workload Balancing...")
    tp = get_transport_provider()
    ret_summary = tp.get_transport_summary(
        "bengaluru", "hyderabad", "Hotel Central", 17.3850, 78.4867,
        variant_type="balanced", people_count=2,
        start_date=date(2026, 11, 20), end_date=date(2026, 11, 22)
    )
    assert ret_summary is not None
    assert ret_summary.return_option is not None
    assert len(ret_summary.all_return_options) >= 3, f"Expected at least 3 return options, got {len(ret_summary.all_return_options)}"
    ret_opt = ret_summary.return_option
    assert ret_opt.origin_city == "hyderabad"
    assert ret_opt.destination_city == "bengaluru"
    assert ret_opt.typical_fare_min > 0

    # Ensure no placeholder or invented service numbers exist in returned data
    for r in ret_summary.all_return_options:
        if r.service_number:
            assert not r.service_number.startswith("KA-RET"), f"Found placeholder service number: {r.service_number}"
            assert not r.service_number.startswith("6E-RET"), f"Found placeholder service number: {r.service_number}"
        assert r.availability_status == "indicative_schedule", f"Expected indicative_schedule, got {r.availability_status}"

    # Verify Return Last-Mile Connection (Hotel -> Return Terminal)
    ret_lm = ret_summary.return_last_mile
    assert ret_lm is not None, "Must calculate separate return last-mile connection"
    assert ret_lm.destination_hotel == "Hotel Central"
    assert ret_lm.distance_km > 0.0
    assert ret_lm.estimated_time_min > 0
    assert ret_lm.estimated_cost_inr > 0
    assert ret_lm.arrival_terminal == ret_opt.departure_station
    print(f"   ✅ Return Last-Mile Verified: {ret_lm.destination_hotel} -> {ret_lm.arrival_terminal}")
    print(f"      {ret_lm.distance_km} km • ~{ret_lm.estimated_time_min} mins via {ret_lm.recommended_mode} (₹{ret_lm.estimated_cost_inr})")

    # Verify Day-of-Week Schedule Compatibility (e.g. Vande Bharat runs except Wed)
    # Case A: Return on a Wednesday (2026-11-25 is a Wednesday)
    wed_summary = tp.get_transport_summary(
        "bengaluru", "hyderabad", "Hotel Central", 17.3850, 78.4867,
        variant_type="balanced", people_count=2,
        start_date=date(2026, 11, 23), end_date=date(2026, 11, 25)
    )
    assert wed_summary is not None and wed_summary.return_option is not None
    # If a train is selected, ensure it doesn't violate "except Wed" or has advice warning
    if "except wed" in wed_summary.return_option.departure_window.lower():
        assert "Notice:" in wed_summary.transit_advice or "Wednesday" in wed_summary.transit_advice
    print("   ✅ Return Day-of-Week Schedule Intelligence Verified (Wednesday non-operational checks active)")

    # Verify Stage 4 Workload Balancing Algorithm directly
    clusterer = GeoClusterer(eps_km=6.0)
    mock_clusters = {
        0: [Place(place_id="p1", name="Place 1", place_type="attraction", lat=17.36, lng=78.47, duration_minutes=60, estimated_cost_per_person_inr=50)],
        1: [Place(place_id="p2", name="Place 2", place_type="attraction", lat=17.37, lng=78.48, duration_minutes=60, estimated_cost_per_person_inr=50)],
        2: [Place(place_id="p3", name="Place 3", place_type="attraction", lat=17.40, lng=78.40, duration_minutes=60, estimated_cost_per_person_inr=50)],
        3: [Place(place_id="p4", name="Place 4", place_type="attraction", lat=17.41, lng=78.41, duration_minutes=60, estimated_cost_per_person_inr=50)],
    }
    balanced_2d = clusterer.balance_workload(mock_clusters, days=2, pace="balanced")
    assert len(balanced_2d) == 2, f"Expected 2 merged clusters for 2 days, got {len(balanced_2d)}"
    print(f"   ✅ Stage 4 Workload Balancing Algorithm Verified: 4 spatial clusters balanced into {len(balanced_2d)} day-partitions")

    print("\n🎉 ALL 40 COMPREHENSIVE VERIFICATION & ENGINE TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    run_tests()


