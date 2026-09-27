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

        # 5. "Why Not X?" Exclusion Analysis
        excluded_reasons: List[ExclusionReason] = []
        hotel_place_id = hotel_sum.hotel_id if hotel_sum else ""

        for place in candidate_places:
            if place.place_type == "hotel" or place.place_id == hotel_place_id:
                continue
            if place.name in scheduled_names:
                continue

            # Why was this place excluded?
            # Reason A: Closed on trip day
            closure_match = False
            if place.closed_days and request.start_date:
                for d_idx in range(request.days or len(plan.days)):
                    current_d = request.start_date + timedelta(days=d_idx)
                    day_name = current_d.strftime("%A").lower()
                    if day_name in [cd.lower() for cd in place.closed_days]:
                        excluded_reasons.append(ExclusionReason(
                            place_name=place.name,
                            category="closed_on_day",
                            reason=f"Venue is closed on {place.closed_days} which overlaps with your trip dates ({day_name.capitalize()}).",
                            suggested_action=f"Plan your visit to {place.name} on days other than {', '.join(place.closed_days).capitalize()}."
                        ))
                        closure_match = True
                        break

            if closure_match:
                continue

            # Reason B: Ticket cost / budget constraint
            cost_pp = place.estimated_cost_per_person_inr or place.entry_fee_inr or 0
            total_ticket = cost_pp * request.people_count
            if total_ticket > (request.budget_inr * 0.35):
                excluded_reasons.append(ExclusionReason(
                    place_name=place.name,
                    category="budget_limit",
                    reason=f"Admission fee (₹{total_ticket} for {request.people_count} guests) exceeds comfortable single-venue budget allocation.",
                    suggested_action="Increase overall trip budget or choose a Comfort variant to include higher-tier admission venues."
                ))
                continue

            # Reason C: Pace limit (max stops per day reached)
            if pace_val == "relaxed":
                excluded_reasons.append(ExclusionReason(
                    place_name=place.name,
                    category="pace_limit",
                    reason="Omitted to maintain a Relaxed pace (maximum 2 sightseeing stops per day).",
                    suggested_action="Switch to 'Balanced' or 'Intensive' pace in the trip settings to unlock additional daily stops."
                ))
                continue

            # Reason D: Geographic detour
            hotel_lat = hotel_sum.lat if hotel_sum else place.lat
            hotel_lng = hotel_sum.lng if hotel_sum else place.lng
            dist_to_base = calculate_distance_km(hotel_lat, hotel_lng, place.lat, place.lng)
            if dist_to_base > 15.0:
                excluded_reasons.append(ExclusionReason(
                    place_name=place.name,
                    category="geographic_detour",
                    reason=f"Located {dist_to_base:.1f} km from your lodging hub; adding this detour would introduce excessive urban transit time.",
                    suggested_action="Dedicate an extra trip day or select a hub closer to this neighborhood."
                ))
                continue

            # Fallback Reason: Priority & schedule packing
            excluded_reasons.append(ExclusionReason(
                place_name=place.name,
                category="operating_hours",
                reason="Available daylight hours were prioritized for higher-matching iconic sights.",
                suggested_action="Add an additional day to your trip duration to fit this attraction."
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
        activities_cost = sum(act.estimated_cost_inr for d in plan.days for act in d.activities if act.place_type == "attraction")

        # Meal heuristics per variant per person per day
        variant_meal_rates = {
            PlanVariantType.BUDGET: 450,
            PlanVariantType.BALANCED: 800,
            PlanVariantType.COMFORT: 1500,
        }
        var_type = plan.variant_type if isinstance(plan.variant_type, PlanVariantType) else PlanVariantType(plan.variant_type)
        daily_meal_pp = variant_meal_rates.get(var_type, 800)
        days_count = max(1, len(plan.days))
        estimated_meals = daily_meal_pp * request.people_count * days_count

        subtotal = lodging_cost + transit_cost + activities_cost + estimated_meals
        buffer = max(0, request.budget_inr - subtotal)

        return ExpenseBreakdown(
            lodging_inr=lodging_cost,
            transit_inr=transit_cost,
            activities_inr=activities_cost,
            estimated_meals_inr=estimated_meals,
            buffer_inr=buffer,
            total_inr=lodging_cost + transit_cost + activities_cost,
            per_person_inr=int((lodging_cost + transit_cost + activities_cost) / max(1, request.people_count))
        )
