"""
Explainability & Decision Trace Engine (Blueprint Stage 10 & v0.2 Specification).
Constructs structured decision rationales ("Why this hotel?") and
exclusion audit traces ("Why not X?") explaining why unscheduled candidates were omitted.
"""
from datetime import timedelta
from typing import List, Dict, Optional, Set
from tripweave.models import (
    TripPlan, TripRequest, Place, DecisionTrace, 
    ExclusionReason, ExpenseBreakdown, GroupProfile, 
    PacePreference, PlanVariantType
)
from tripweave.distance import calculate_distance_km

class ExplainabilityEngine:
    """
    Synthesizes actionable, human-transparent reasoning for optimizer choices.
    """

    @classmethod
    def generate_decision_trace(
        cls,
        plan: TripPlan,
        request: TripRequest,
        candidate_places: List[Place]
    ) -> DecisionTrace:
        scheduled_names: Set[str] = set()
        for day in plan.days:
            for act in day.activities:
                scheduled_names.add(act.place_name)

        # 1. Hotel Rationale
        hotel_sum = plan.hotel_summary
        if hotel_sum and hotel_sum.nights > 0:
            hotel_text = (
                f"Selected {hotel_sum.hotel_name} (₹{hotel_sum.price_per_night_per_room}/room/night) "
                f"for its optimal geographic centroid location relative to your daily attraction clusters, "
                f"saving estimated daily transit time while comfortably accommodating {hotel_sum.people_accommodated} guests in {hotel_sum.rooms_needed} room(s)."
            )
        else:
            hotel_text = "Single-day itinerary starts and concludes directly at your designated city transit hub."

        # 2. Pacing Rationale
        pace_val = request.pace.value if hasattr(request.pace, "value") else str(request.pace)
        stops_count = sum(len(d.activities) for d in plan.days)
        pacing_text = (
            f"Configured for '{pace_val.capitalize()}' pace with an average of {stops_count / max(1, len(plan.days)):.1f} "
            f"visits per day, prioritizing continuous daylight exploration and comfortable transit buffers."
        )

        # 3. Group Profile Rationale
        profile_val = request.group_profile.value if hasattr(request.group_profile, "value") else str(request.group_profile)
        if profile_val == "elderly":
            group_text = "Calibrated for senior travelers: minimized walking distances, transit transfers, and elevated fatigue margins."
        elif profile_val == "family":
            group_text = "Calibrated for families: includes midday rest intervals and balanced sightseeing density."
        elif profile_val == "young_solo":
            group_text = "Calibrated for solo active exploration: maximizes sightseeing coverage with brisk transfer paces."
        else:
            group_text = "Calibrated for general leisure travelers balancing iconic highlights with relaxed transit."

        # 4. Weather Rationale
        weather_text = None
        if plan.days and plan.days[0].weather:
            w = plan.days[0].weather
            weather_text = f"Day 1 forecast: {w.condition}, peak {w.max_temp_c:.1f}°C. {w.advisory_text}"

        # 5. "Why Not X?" Candidate Omission Diagnostic
        excluded_reasons: List[ExclusionReason] = []
        hotel_place_id = hotel_sum.hotel_id if hotel_sum else ""

        # Precalculate remaining buffer for budget diagnostic
        lodging_cost = plan.hotel_summary.total_cost_inr if plan.hotel_summary else 0
        direct_spent = plan.total_cost_inr
        unallocated_buffer = max(0, request.budget_inr - direct_spent)

        # Pace & Daily Stop Limit calculations
        is_elderly = (
            request.group_profile == GroupProfile.ELDERLY or 
            str(getattr(request.group_profile, "value", request.group_profile)).lower() == "elderly"
        )
        if pace_val == "relaxed":
            max_allowed_stops = 2
        elif pace_val == "intensive":
            max_allowed_stops = 4
        else:
            max_allowed_stops = 3
        if is_elderly:
            max_allowed_stops = max(1, max_allowed_stops - 1)

        all_days_saturated = len(plan.days) > 0 and all(len(d.activities) >= max_allowed_stops for d in plan.days)

        for place in candidate_places:
            if place.place_type == "hotel" or place.place_id == hotel_place_id:
                continue
            if place.name in scheduled_names:
                continue

            # Reason A: Day-of-Week Closure
            if place.closed_days and request.start_date:
                matching_closed_days = []
                trip_day_count = request.days or len(plan.days)
                for d_idx in range(trip_day_count):
                    current_d = request.start_date + timedelta(days=d_idx)
                    day_name = current_d.strftime("%A").lower()
                    if day_name in [cd.lower() for cd in place.closed_days]:
                        matching_closed_days.append(day_name.capitalize())
                
                if matching_closed_days:
                    if len(matching_closed_days) == trip_day_count:
                        reason = f"Candidate Omission Diagnostic: Venue is closed on {', '.join(place.closed_days).capitalize()}, making it impossible to visit on any of your trip dates ({', '.join(matching_closed_days)})."
                    else:
                        reason = f"Candidate Omission Diagnostic: Venue is closed on {', '.join(matching_closed_days)} during your trip window, restricting feasible scheduling."
                    excluded_reasons.append(ExclusionReason(
                        place_name=place.name,
                        category="closed_on_day",
                        reason=reason,
                        suggested_action=f"Plan your visit to {place.name} on days other than {', '.join(place.closed_days).capitalize()}."
                    ))
                    continue

            # Reason B: Operating Hours Window
            if place.open_time_mins is not None and place.open_time_mins >= 600:
                open_hr = 8 + (place.open_time_mins // 60)
                open_min = place.open_time_mins % 60
                excluded_reasons.append(ExclusionReason(
                    place_name=place.name,
                    category="operating_hours",
                    reason=f"Candidate Omission Diagnostic: Venue opening time is late ({open_hr}:{open_min:02d} IST), outside regular daytime touring hours.",
                    suggested_action=f"Schedule {place.name} as a standalone evening activity."
                ))
                continue

            if place.close_time_mins is not None and place.close_time_mins <= 180:
                close_hr = 8 + (place.close_time_mins // 60)
                close_min = place.close_time_mins % 60
                excluded_reasons.append(ExclusionReason(
                    place_name=place.name,
                    category="operating_hours",
                    reason=f"Candidate Omission Diagnostic: Venue closes early ({close_hr}:{close_min:02d} IST), leaving insufficient transit and dwell window.",
                    suggested_action="Start morning departures earlier or dedicate an early morning slot."
                ))
                continue

            # Reason C: Pace & Daily Stop Limit Saturated
            if all_days_saturated:
                excluded_reasons.append(ExclusionReason(
                    place_name=place.name,
                    category="pace_limit",
                    reason=f"Candidate Omission Diagnostic: Daily stop quota reached. Under '{pace_val.capitalize()}' pace ({max_allowed_stops} stops/day max), all {len(plan.days)} trip days are at full capacity.",
                    suggested_action="Switch to 'Balanced' or 'Intensive' pace in trip settings to unlock additional daily stops."
                ))
                continue

            # Reason D: Ticket Cost / Budget Constraint
            cost_pp = place.estimated_cost_per_person_inr or place.entry_fee_inr or 0
            total_ticket = cost_pp * request.people_count
            if total_ticket > (request.budget_inr * 0.35) or (unallocated_buffer > 0 and total_ticket > unallocated_buffer):
                excluded_reasons.append(ExclusionReason(
                    place_name=place.name,
                    category="budget_limit",
                    reason=f"Candidate Omission Diagnostic: Admission fee (₹{total_ticket} for {request.people_count} guests) exceeds remaining unallocated budget (₹{unallocated_buffer}).",
                    suggested_action="Increase overall trip budget or select a Comfort variant to allocate more toward entry tickets."
                ))
                continue

            # Reason E: Geographic Detour Distance
            hotel_lat = hotel_sum.lat if hotel_sum else place.lat
            hotel_lng = hotel_sum.lng if hotel_sum else place.lng
            dist_to_base = calculate_distance_km(hotel_lat, hotel_lng, place.lat, place.lng)
            
            day_dists = []
            for d in plan.days:
                if d.activities:
                    avg_lat = sum(a.lat for a in d.activities if a.lat) / len(d.activities)
                    avg_lng = sum(a.lng for a in d.activities if a.lng) / len(d.activities)
                    day_dists.append(calculate_distance_km(avg_lat, avg_lng, place.lat, place.lng))
            min_cluster_dist = min(day_dists) if day_dists else dist_to_base

            if dist_to_base > 14.0 or min_cluster_dist > 12.0:
                excluded_reasons.append(ExclusionReason(
                    place_name=place.name,
                    category="geographic_detour",
                    reason=f"Candidate Omission Diagnostic: Located {dist_to_base:.1f} km from your lodging hub and {min_cluster_dist:.1f} km from daily clusters; route solver determined detour transit time (> 40 mins) exceeds time budget.",
                    suggested_action="Dedicate an extra trip day or select a hub closer to this neighborhood."
                ))
                continue

            # Fallback Reason: Priority & daylight packing
            excluded_reasons.append(ExclusionReason(
                place_name=place.name,
                category="operating_hours",
                reason=f"Candidate Omission Diagnostic: Solved route prioritized higher-interest iconic attractions within the available daylight transit window.",
                suggested_action=f"Pin '{place.name}' as a must-visit attraction or extend trip duration by 1 day."
            ))

        return DecisionTrace(
            hotel_rationale=hotel_text,
            pacing_rationale=pacing_text,
            weather_rationale=weather_text,
            group_profile_rationale=group_text,
            excluded_places=excluded_reasons
        )

    @classmethod
    def calculate_expense_breakdown(
        cls,
        plan: TripPlan,
        request: TripRequest
    ) -> ExpenseBreakdown:
        lodging_cost = plan.hotel_summary.total_cost_inr if plan.hotel_summary else 0
        transit_cost = plan.estimated_transport_cost_inr
        activities_cost = sum(act.estimated_cost_inr for d in plan.days for act in d.activities if act.place_type != "restaurant")
        dining_cost = sum(act.estimated_cost_inr for d in plan.days for act in d.activities if act.place_type == "restaurant")

        # Direct subtotal strictly reconciles: Lodging + Transit + Activities + Scheduled Dining == plan.total_cost_inr
        direct_subtotal = lodging_cost + transit_cost + activities_cost + dining_cost
        unallocated_buffer = max(0, request.budget_inr - direct_subtotal)

        # Suggested meals per variant per person per day
        variant_meal_rates = {
            PlanVariantType.BUDGET: 450,
            PlanVariantType.BALANCED: 800,
            PlanVariantType.COMFORT: 1500,
        }
        var_type = plan.variant_type if isinstance(plan.variant_type, PlanVariantType) else PlanVariantType(plan.variant_type)
        daily_meal_pp = variant_meal_rates.get(var_type, 800)
        days_count = max(1, len(plan.days))
        suggested_meals = daily_meal_pp * request.people_count * days_count

        if unallocated_buffer >= suggested_meals:
            meal_status = f"Sufficient (Buffer ₹{unallocated_buffer} covers suggested meals ₹{suggested_meals})"
        else:
            diff = suggested_meals - unallocated_buffer
            meal_status = f"Exceeds buffer by ₹{diff} (Consider adding budget for off-itinerary dining)"

        return ExpenseBreakdown(
            lodging_inr=lodging_cost,
            transit_inr=transit_cost,
            activities_inr=activities_cost,
            dining_inr=dining_cost,
            direct_subtotal_inr=direct_subtotal,
            unallocated_buffer_inr=unallocated_buffer,
            suggested_meals_inr=suggested_meals,
            meal_buffer_status=meal_status,
            buffer_inr=unallocated_buffer,
            estimated_meals_inr=suggested_meals,
            total_inr=direct_subtotal,
            per_person_inr=int(direct_subtotal / max(1, request.people_count))
        )
