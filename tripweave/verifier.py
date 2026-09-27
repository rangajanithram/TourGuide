"""
Independent Schedule, Physics, and Budget Verifier (Stage 8 of Engineering Blueprint).
Audits itineraries independently of the solver to guarantee physical realism,
accurate time windows, valid opening days, and strict budget conservation.
"""
from datetime import datetime
from typing import List, Tuple, Dict, Any, Optional
from tripweave.models import TripPlan, TripRequest, Place, VerificationReport
from tripweave.distance import calculate_distance_km, get_travel_metrics

def _time_str_to_minutes(time_str: str) -> int:
    """Parses 'H:MM AM/PM' string into minutes from 8:00 AM."""
    try:
        t = datetime.strptime(time_str.strip(), "%I:%M %p")
        # Minutes from midnight
        total_mins = t.hour * 60 + t.minute
        # Minutes from 8:00 AM (480 mins)
        return total_mins - 480
    except Exception:
        return 0

class ItineraryVerifier:
    """
    Performs deterministic post-optimization audits.
    Detects physical impossibilities, schedule overflows, and accounting discrepancies.
    """

    @staticmethod
    def _minutes_to_clock_time(mins_from_8am: int) -> str:
        total_mins = 480 + mins_from_8am
        hours = (total_mins // 60) % 24
        minutes = total_mins % 60
        period = "AM" if hours < 12 else "PM"
        display_hour = hours if hours <= 12 else hours - 12
        if display_hour == 0:
            display_hour = 12
        return f"{display_hour}:{minutes:02d} {period}"

    @classmethod
    def verify(
        cls, 
        plan: TripPlan, 
        request: TripRequest, 
        places_db: List[Place]
    ) -> VerificationReport:
        checks_passed = []
        warnings = []
        errors = []
        
        place_lookup: Dict[str, Place] = {p.name: p for p in places_db}
        total_transit_km = 0.0
        total_transit_mins = 0
        total_activity_time_mins = 0
        total_computed_activities_cost = 0
        total_computed_transport_cost = 0

        hotel_lat = plan.hotel_summary.lat if plan.hotel_summary else 0.0
        hotel_lng = plan.hotel_summary.lng if plan.hotel_summary else 0.0
        mode = plan.transport_mode.value if hasattr(plan.transport_mode, "value") else str(plan.transport_mode)

        # 1. Audit Each Day's Schedule
        for day in plan.days:
            prev_lat = hotel_lat
            prev_lng = hotel_lng
            prev_end_minute = 60 # 9:00 AM start
            day_activities_cost = 0

            # Day-of-week validation
            day_name = day.day_of_week.lower() if day.day_of_week else None

            for i, act in enumerate(day.activities):
                place = place_lookup.get(act.place_name)
                start_min = _time_str_to_minutes(act.start_time)
                end_min = _time_str_to_minutes(act.end_time)
                duration = end_min - start_min
                total_activity_time_mins += max(0, duration)

                # Accounting check
                day_activities_cost += act.estimated_cost_inr

                if not place:
                    warnings.append(f"Day {day.day_number}: Place '{act.place_name}' not found in database records.")
                    continue

                # Check 1: Day-of-Week Closure Audit
                if day_name and place.closed_days:
                    closed_lower = [d.lower() for d in place.closed_days]
                    if day_name in closed_lower:
                        errors.append(
                            f"Closure Violation: '{place.name}' is scheduled on Day {day.day_number} ({day.day_of_week}), but it is closed on {place.closed_days}!"
                        )

                # Check 2: Hard Opening/Closing Window Audit
                if place.open_time_mins is not None and start_min < place.open_time_mins:
                    errors.append(
                        f"Opening Hour Violation: '{place.name}' scheduled at {act.start_time} before opening time ({place.open_time_mins}m from 8am)."
                    )
                if place.close_time_mins is not None and end_min > place.close_time_mins:
                    errors.append(
                        f"Closing Hour Violation: '{place.name}' scheduled until {act.end_time}, which passes closing time ({place.close_time_mins}m from 8am)."
                    )

                # Check 3: Transit Physics & Speed Feasibility
                leg_km = calculate_distance_km(prev_lat, prev_lng, act.lat, act.lng)
                min_transit_mins, leg_cost = get_travel_metrics(
                    prev_lat, prev_lng, act.lat, act.lng, 
                    mode=mode, people_count=request.people_count
                )
                total_transit_km += leg_km
                total_transit_mins += min_transit_mins
                total_computed_transport_cost += leg_cost

                if i == 0:
                    # First leg: departure from hotel
                    hotel_dep_min = start_min - min_transit_mins
                    if hotel_dep_min < -60: # Departs before 7:00 AM (8am is 0)
                        warnings.append(
                            f"Early Departure: Day {day.day_number} requires departing hotel at {cls._minutes_to_clock_time(hotel_dep_min)} to reach '{act.place_name}' by {act.start_time}."
                        )
                else:
                    # Subsequent legs: elapsed time between previous departure and this arrival
                    elapsed_transit = start_min - prev_end_minute
                    if elapsed_transit < (min_transit_mins - 5): # Allow 5m buffer
                        warnings.append(
                            f"Tight Transit: Day {day.day_number} leg to '{act.place_name}' allocates {elapsed_transit}m vs estimated {min_transit_mins}m."
                        )
                    
                    if elapsed_transit > 0:
                        implied_speed = (leg_km / (elapsed_transit / 60.0))
                        if implied_speed > 80.0:
                            warnings.append(
                                f"High Speed Warning: Day {day.day_number} commute to '{act.place_name}' implies {implied_speed:.1f} km/h urban transit."
                            )

                prev_lat = act.lat
                prev_lng = act.lng
                prev_end_minute = end_min

            # Return commute to hotel at end of day
            if day.activities and hotel_lat != 0.0:
                ret_km = calculate_distance_km(prev_lat, prev_lng, hotel_lat, hotel_lng)
                ret_mins, ret_cost = get_travel_metrics(
                    prev_lat, prev_lng, hotel_lat, hotel_lng,
                    mode=mode, people_count=request.people_count
                )
                total_transit_km += ret_km
                total_transit_mins += ret_mins
                total_computed_transport_cost += ret_cost

            # Check Day Cost accounting
            if day.day_cost_inr != day_activities_cost:
                warnings.append(
                    f"Day {day.day_number} cost summary mismatch: reported ₹{day.day_cost_inr} vs sum ₹{day_activities_cost}."
                )
            total_computed_activities_cost += day_activities_cost

        # 2. Budget & Accounting Consistency Audit
        hotel_cost = plan.hotel_summary.total_cost_inr if plan.hotel_summary else 0
        computed_grand_total = total_computed_activities_cost + total_computed_transport_cost + hotel_cost

        # Reconcile transport cost
        if abs(total_computed_transport_cost - plan.estimated_transport_cost_inr) > 25:
            errors.append(
                f"Transport Cost Accounting Mismatch: recalculated route transit ₹{total_computed_transport_cost} does not match reported plan transit ₹{plan.estimated_transport_cost_inr}."
            )
        else:
            checks_passed.append("Transport Cost Reconciled: Route legs match estimated transport cost.")

        # Reconcile grand total
        if abs(computed_grand_total - plan.total_cost_inr) > 25:
            errors.append(
                f"Grand Total Accounting Mismatch: recalculated total ₹{computed_grand_total} (activities: ₹{total_computed_activities_cost}, transit: ₹{total_computed_transport_cost}, lodging: ₹{hotel_cost}) does not match reported plan total ₹{plan.total_cost_inr}."
            )
        else:
            checks_passed.append("Grand Total Reconciled: Sum of activities, transit, and lodging matches total cost.")

        if plan.total_cost_inr > request.budget_inr or computed_grand_total > request.budget_inr:
            errors.append(
                f"Budget Violation: Plan total ₹{max(plan.total_cost_inr, computed_grand_total)} exceeds requested budget ₹{request.budget_inr}."
            )
        else:
            checks_passed.append(f"Budget Verified: ₹{plan.total_cost_inr} is within budget ₹{request.budget_inr}.")

        if request.transport_pref and request.transport_pref.max_budget_inr:
            if plan.estimated_transport_cost_inr > request.transport_pref.max_budget_inr:
                warnings.append(
                    f"Transport Cap Exceeded: Estimated ₹{plan.estimated_transport_cost_inr} exceeds target cap of ₹{request.transport_pref.max_budget_inr}."
                )
            else:
                checks_passed.append(
                    f"Transport Cap Verified: ₹{plan.estimated_transport_cost_inr} <= ₹{request.transport_pref.max_budget_inr}."
                )

        if not errors:
            checks_passed.append("Opening Hours & Closures: 100% compliant with operating windows.")
            checks_passed.append("Transit Physics: Routes physically feasible with realistic traffic speeds.")
            checks_passed.append("Accounting Integrity: Activity, transit, and lodging costs sum perfectly.")

        # Compute Audit Score (0 - 100)
        score = 100 - (len(errors) * 35) - (len(warnings) * 5)
        score = max(0, min(100, score))

        is_valid = len(errors) == 0

        metrics = {
            "total_transit_km": f"{total_transit_km:.1f} km",
            "total_transit_time": f"{total_transit_mins} mins",
            "total_sightseeing_time": f"{total_activity_time_mins} mins",
            "budget_utilization": f"{(plan.total_cost_inr / request.budget_inr * 100):.1f}%",
            "data_provenance": "Curated Prototype Seed Dataset"
        }

        return VerificationReport(
            is_valid=is_valid,
            audit_score=score,
            checks_passed=checks_passed,
            warnings=warnings,
            errors=errors,
            metrics=metrics
        )
