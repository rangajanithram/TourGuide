"""
Explainability & Decision Trace Engine (Blueprint Stage 10 & v0.2 Specification).
Constructs structured decision rationales ("Why this hotel?") and
exclusion audit traces ("Why not X?") explaining why unscheduled candidates were omitted.
"""
from typing import List
from tripweave.models import (
    TripPlan, TripRequest, Place, DecisionTrace, 
    ExpenseBreakdown, PlanVariantType
)

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
        # 1. Hotel Rationale
        hotel_sum = plan.hotel_summary
        if hotel_sum and request.stay_choice:
            hotel_text = hotel_sum.why_this_hotel or hotel_sum.provenance
        elif hotel_sum and hotel_sum.nights > 0:
            hotel_text = (
                f"{hotel_sum.hotel_name} is an estimated stay option near your planned areas. "
                f"The plan includes {hotel_sum.rooms_needed} room(s) for {hotel_sum.people_accommodated} guests. "
                "Confirm the rate and availability before booking."
            )
        else:
            hotel_text = "Single-day itinerary starts and concludes directly at your designated city transit hub."

        # 2. Pacing Rationale
        pace_val = request.pace.value if hasattr(request.pace, "value") else str(request.pace)
        stops_count = sum(not a.meal_type and a.place_type != 'rest_break' for d in plan.days for a in d.activities)
        pacing_text = (
            f"{pace_val.capitalize()} pace: about {stops_count / max(1, len(plan.days)):.1f} "
            "visits per day. Meal breaks are separate. Nearby places are grouped where times and required stops allow."
        )

        # 3. Group Profile Rationale
        profile_val = request.group_profile.value if hasattr(request.group_profile, "value") else str(request.group_profile)
        if profile_val == "elderly":
            group_text = "Fewer daily visits for senior travelers, with your travel and comfort choices applied."
        elif profile_val == "family":
            group_text = "Your family travel settings are used to check the pace and effort of this plan."
        elif profile_val == "young_solo":
            group_text = "Your solo travel settings are used to check the pace and effort of this plan."
        else:
            group_text = "Your chosen pace and travel mode are used to check this plan."

        # 4. Weather Rationale
        weather_text = None
        if plan.days and plan.days[0].weather:
            w = plan.days[0].weather
            weather_text = f"Day 1 forecast: {w.condition}, peak {w.max_temp_c:.1f}°C. {w.advisory_text}"

        from tripweave.exclusions import exclusion_hints
        excluded_reasons = exclusion_hints(plan, request, candidate_places)

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
        # Count every requested trip day, including days with no scheduled stops.
        days_count = max(1, request.days or len(plan.days))
        suggested_meals = daily_meal_pp * request.people_count * days_count
        if request.meal_budget_per_person is not None and plan.meal_places:
            # Every requested in-window meal is already a mandatory, costed stop.
            # Do not add a second generic allowance for those same meals.
            suggested_meals = dining_cost
        # Scheduled restaurant spend is already part of direct_subtotal; only
        # reserve the remaining meal allowance to avoid double-counting it.
        additional_meals = max(0, suggested_meals - dining_cost)

        if unallocated_buffer >= additional_meals:
            meal_status = f"Sufficient (Buffer ₹{unallocated_buffer} covers additional meal estimate ₹{additional_meals})"
        else:
            diff = additional_meals - unallocated_buffer
            meal_status = f"Additional meals exceed remaining buffer by ₹{diff} (Consider increasing the on-ground budget)"

        return ExpenseBreakdown(
            lodging_inr=lodging_cost,
            transit_inr=transit_cost,
            activities_inr=activities_cost,
            dining_inr=dining_cost,
            direct_subtotal_inr=direct_subtotal,
            unallocated_buffer_inr=unallocated_buffer,
            suggested_meals_inr=suggested_meals,
            additional_meals_inr=additional_meals,
            budget_limit_inr=request.budget_inr,
            meal_buffer_status=meal_status,
            buffer_inr=unallocated_buffer,
            estimated_meals_inr=suggested_meals,
            total_inr=request.budget_inr,
            per_person_inr=int(request.budget_inr / max(1, request.people_count))
        )
