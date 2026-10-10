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
    """Parses 'H:MM AM/PM' or 'HH:MM' string (including '(+N day)' suffix) into minutes from 8:00 AM."""
    try:
        raw = time_str.strip()
        day_offset = 0
        if "(+" in raw and "day)" in raw:
            prefix, suffix = raw.split("(+", 1)
            raw = prefix.strip()
            day_offset = int(suffix.split("day")[0].strip())
        for fmt in ("%I:%M %p", "%H:%M"):
            try:
                t = datetime.strptime(raw.upper(), fmt)
                total_mins = day_offset * 1440 + t.hour * 60 + t.minute
                return total_mins - 480
            except ValueError:
                continue
        raise ValueError("Invalid activity time")
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError("Invalid activity time") from error

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
        places_db: List[Place],
        strict_route_reconciliation: bool = True,
        live_position: Optional[Tuple[float, float]] = None,
        live_day: Optional[int] = None,
    ) -> VerificationReport:
        checks_passed = []
        warnings = []
        errors = []

        place_lookup: Dict[str, Place] = {}
        for p in places_db:
            place_lookup[p.name.lower()] = p
            place_lookup[p.place_id.lower()] = p
        total_transit_km = 0.0
        total_transit_mins = 0
        total_activity_time_mins = 0
        total_computed_activities_cost = 0
        total_computed_dining_cost = 0
        total_computed_attractions_cost = 0
        total_computed_transport_cost = 0
        visited_places = set()
        dependency_checks_passed = True

        hotel_lat = plan.hotel_summary.lat if plan.hotel_summary else 0.0
        hotel_lng = plan.hotel_summary.lng if plan.hotel_summary else 0.0
        mode = plan.transport_mode.value if hasattr(plan.transport_mode, "value") else str(plan.transport_mode)

        # 0. Minimum Activity Density Check
        total_activities_count = sum(a.place_type not in ("restaurant", "rest_break") for d in plan.days for a in d.activities)
        if total_activities_count == 0:
            errors.append("Empty Itinerary: No sightseeing activities could be scheduled within constraints.")
        else:
            checks_passed.append(f"Itinerary Activity Density: {total_activities_count} visits scheduled across {len(plan.days)} day(s).")

        # 1. Audit Each Day's Schedule
        for day in plan.days:
            prev_lat = hotel_lat
            prev_lng = hotel_lng
            prev_end_minute = 60 # 9:00 AM start
            day_activities_cost = 0

            # Day-of-week validation
            try:
                day_name = datetime.strptime(day.date, "%Y-%m-%d").strftime("%A").lower() if day.date else (day.day_of_week.lower() if day.day_of_week else None)
            except (ValueError, TypeError):
                errors.append(f"Invalid calendar date on Day {day.day_number}.")
                day_name = None

            for i, act in enumerate(day.activities):
                try:
                    start_min = _time_str_to_minutes(act.start_time)
                    end_min = _time_str_to_minutes(act.end_time)
                except ValueError:
                    errors.append(f"Invalid Time Window: Day {day.day_number} stop '{act.place_name}' has malformed times.")
                    continue
                duration = end_min - start_min
                if duration <= 0:
                    errors.append(
                        f"Invalid Time Window: '{act.place_name}' on Day {day.day_number} has non-positive duration ({act.start_time} - {act.end_time})."
                    )
                if i > 0 and start_min < prev_end_minute:
                    errors.append(
                        f"Schedule Overlap: Day {day.day_number} stop '{act.place_name}' starts at {act.start_time} before previous stop ends."
                    )
                total_activity_time_mins += max(0, duration)

                # Accounting check
                day_activities_cost += act.estimated_cost_inr

                if act.place_type == "rest_break":
                    leg_km = calculate_distance_km(prev_lat, prev_lng, act.lat, act.lng)
                    if leg_km < 0.01:
                        min_transit_mins, leg_cost = 0, 0
                    else:
                        min_transit_mins, leg_cost = get_travel_metrics(
                            prev_lat, prev_lng, act.lat, act.lng,
                            mode=mode, people_count=request.people_count
                        )
                    total_transit_km += leg_km
                    total_transit_mins += min_transit_mins
                    total_computed_transport_cost += leg_cost
                    if start_min >= 960 or end_min >= 960:
                        errors.append(
                            f"Day Window Overflow: Day {day.day_number} rest break extends beyond calendar day ({act.start_time} - {act.end_time})."
                        )
                    prev_lat = act.lat
                    prev_lng = act.lng
                    prev_end_minute = end_min
                    continue

                place = place_lookup.get(act.place_name.lower()) or (place_lookup.get(act.place_id.lower()) if act.place_id else None)
                if not place:
                    errors.append(f"Day {day.day_number}: Place '{act.place_name}' not found in database records.")
                    if act.place_id:
                        visited_places.add(act.place_id.lower())
                    visited_places.add(act.place_name.lower())
                    prev_lat = act.lat
                    prev_lng = act.lng
                    prev_end_minute = end_min
                    continue

                # Dining vs Sightseeing Cost Categorization
                if act.place_type == "restaurant" or getattr(place, "place_type", "") == "restaurant":
                    total_computed_dining_cost += act.estimated_cost_inr
                    # Verify meal window: Lunch (11:30 AM - 3:30 PM: 210 to 450) or Dinner (6:30 PM - 10:30 PM: 630 to 870)
                    if not ((210 <= start_min <= 450) or (630 <= start_min <= 870)):
                        warnings.append(
                            f"Off-Peak Dining: Restaurant '{act.place_name}' scheduled at {act.start_time}, outside standard lunch (11:30 AM - 3:30 PM) or dinner (6:30 PM - 10:30 PM) service."
                        )
                else:
                    total_computed_attractions_cost += act.estimated_cost_inr

                # Check Activity Dependencies (Blueprint Section 1 & 5)
                if getattr(place, "depends_on", None):
                    for dep in place.depends_on:
                        dep_clean = dep.strip().lower()
                        if dep_clean not in visited_places:
                            errors.append(
                                f"Dependency Violation: '{place.name}' depends on '{dep}', but '{dep}' was not visited prior to this stop."
                            )
                            dependency_checks_passed = False

                visited_places.add(place.place_id.lower())
                visited_places.add(place.name.lower())

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
                if not strict_route_reconciliation and leg_km < 0.01:
                    min_transit_mins, leg_cost = 0, 0
                else:
                    min_transit_mins, leg_cost = get_travel_metrics(
                        prev_lat, prev_lng, act.lat, act.lng,
                        mode=mode, people_count=request.people_count
                    )
                total_transit_km += leg_km
                total_transit_mins += min_transit_mins
                total_computed_transport_cost += leg_cost

                # Live GPS affects only the first future leg's timing; never serialize it.
                # Costs remain the full itinerary estimate at its retained coarse locations.
                if live_position is not None and day.day_number == live_day and i > 0 and day.activities[i - 1].place_type == "rest_break":
                    min_transit_mins = get_travel_metrics(*live_position, act.lat, act.lng, mode=mode, people_count=request.people_count)[0]

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
                    if elapsed_transit < min_transit_mins:
                        errors.append(
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
                if not strict_route_reconciliation and ret_km < 0.01:
                    ret_mins, ret_cost = 0, 0
                else:
                    ret_mins, ret_cost = get_travel_metrics(
                        prev_lat, prev_lng, hotel_lat, hotel_lng,
                        mode=mode, people_count=request.people_count
                    )
                total_transit_km += ret_km
                total_transit_mins += ret_mins
                total_computed_transport_cost += ret_cost

                # Verify full physical day schedule window
                hotel_arrival_min = prev_end_minute + ret_mins
                # 8:00 AM is 0 min. 8:00 PM is 720 mins. 9:00 PM is 780 mins.
                if hotel_arrival_min > 780:
                    errors.append(
                        f"Day Window Overflow: Day {day.day_number} return commute reaches hotel at {cls._minutes_to_clock_time(hotel_arrival_min)}, past the 9:00 PM physical cutoff."
                    )
                elif hotel_arrival_min > 720:
                    warnings.append(
                        f"Late Hotel Return: Day {day.day_number} return commute reaches hotel at {cls._minutes_to_clock_time(hotel_arrival_min)}, past the 8:00 PM target window."
                    )

            # Check Day Cost accounting
            if day.day_cost_inr != day_activities_cost:
                errors.append(
                    f"Day {day.day_number} cost summary mismatch: reported ₹{day.day_cost_inr} vs sum ₹{day_activities_cost}."
                )
            total_computed_activities_cost += day_activities_cost

        # 1b. Pinned / Locked Stop Retention Check
        if request.locked_activities:
            for pin in request.locked_activities:
                pin_clean = pin.strip().lower()
                if pin_clean and pin_clean not in visited_places:
                    errors.append(
                        f"Pinned Stop Violation: Mandatory pinned stop '{pin}' is missing from the itinerary."
                    )

        # 2. Budget & Accounting Consistency Audit
        hotel_cost = plan.hotel_summary.total_cost_inr if plan.hotel_summary else 0
        effective_transport_cost = total_computed_transport_cost if strict_route_reconciliation else plan.estimated_transport_cost_inr
        computed_grand_total = total_computed_activities_cost + effective_transport_cost + hotel_cost

        # Reconcile transport cost
        if strict_route_reconciliation:
            if abs(total_computed_transport_cost - plan.estimated_transport_cost_inr) > 25:
                errors.append(
                    f"Transport Cost Accounting Mismatch: recalculated route transit ₹{total_computed_transport_cost} does not match reported plan transit ₹{plan.estimated_transport_cost_inr}."
                )
            else:
                checks_passed.append("Transport Cost Reconciled: Route legs match estimated transport cost.")

        # Reconcile grand total
        if abs(computed_grand_total - plan.total_cost_inr) > 25:
            errors.append(
                f"Grand Total Accounting Mismatch: recalculated total ₹{computed_grand_total} (activities: ₹{total_computed_activities_cost}, transit: ₹{effective_transport_cost}, lodging: ₹{hotel_cost}) does not match reported plan total ₹{plan.total_cost_inr}."
            )
        else:
            checks_passed.append("Grand Total Reconciled: Sum of activities, transit, and lodging matches total cost.")

        if plan.total_cost_inr > request.budget_inr or computed_grand_total > request.budget_inr:
            errors.append(
                f"Budget Violation: Plan total ₹{max(plan.total_cost_inr, computed_grand_total)} exceeds requested on-ground budget ₹{request.budget_inr}."
            )
        else:
            checks_passed.append(f"Budget Verified: ₹{plan.total_cost_inr} is within on-ground budget ₹{request.budget_inr}.")

        # Enforce transport cap strictly as a hard error if exceeded
        if request.transport_pref and request.transport_pref.max_budget_inr:
            reported_transport = plan.estimated_transport_cost_inr
            actual_transport = effective_transport_cost
            if reported_transport > request.transport_pref.max_budget_inr or actual_transport > request.transport_pref.max_budget_inr:
                errors.append(
                    f"Transport Cap Violation: Estimated transport ₹{max(reported_transport, actual_transport)} exceeds requested cap of ₹{request.transport_pref.max_budget_inr}."
                )
            else:
                checks_passed.append(
                    f"Transport Cap Verified: ₹{reported_transport} <= ₹{request.transport_pref.max_budget_inr}."
                )

        if not errors:
            checks_passed.append("Opening Hours & Closures: 100% compliant with curated operating windows.")
            checks_passed.append("Transit Physics: Routes physically feasible with realistic traffic speeds.")
            checks_passed.append("Accounting Integrity: Activity, transit, and lodging costs sum accurately.")
            if dependency_checks_passed:
                checks_passed.append("Activity Dependencies: All prerequisite activity chains respected.")

        # Compute Audit Score (0 - 100)
        score = 100 - (len(errors) * 35) - (len(warnings) * 5)
        score = max(0, min(100, score))

        is_valid = len(errors) == 0

        metrics = {
            "total_transit_km": f"{total_transit_km:.1f} km",
            "total_transit_time": f"{total_transit_mins} mins",
            "total_sightseeing_time": f"{total_activity_time_mins} mins",
            "budget_utilization": f"{(plan.total_cost_inr / max(1, request.budget_inr) * 100):.1f}%",
            "total_attractions_spend": f"₹{total_computed_attractions_cost}",
            "total_dining_spend": f"₹{total_computed_dining_cost}",
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
