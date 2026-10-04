"""
Fatigue & Pace Engine (Stage 7 of Engineering Blueprint).
Computes physical fatigue scores based on transit distance, transfers,
activity density, and user pace preferences.
"""
from typing import Dict, Any, List, Optional
from tripweave.models import DayPlan, PacePreference, GroupProfile
from tripweave.distance import calculate_distance_km

class FatigueAnalyzer:
    """
    Evaluates physical exertion, travel density, and pacing realism
    calibrated by GroupProfile (Blueprint Section 6) and PacePreference.
    """

    PROFILE_COEFFICIENTS = {
        "young_solo": {"per_km": 5.0,  "per_activity": 4.0,  "per_transfer": 3.0},
        "family":     {"per_km": 10.0, "per_activity": 7.0,  "per_transfer": 6.0},
        "elderly":    {"per_km": 20.0, "per_activity": 12.0, "per_transfer": 10.0},
        "default":    {"per_km": 10.0, "per_activity": 8.0,  "per_transfer": 5.0},
    }

    PACE_MULTIPLIERS = {
        "relaxed": 0.85,
        "balanced": 1.0,
        "intensive": 1.25,
    }

    @classmethod
    def evaluate_day(
        cls, 
        day: DayPlan, 
        pace: PacePreference = PacePreference.BALANCED,
        group_profile: GroupProfile = GroupProfile.DEFAULT,
        est_transit_km: float = 15.0
    ) -> Dict[str, Any]:
        profile_key = group_profile.value if hasattr(group_profile, "value") else str(group_profile).lower()
        coeffs = cls.PROFILE_COEFFICIENTS.get(profile_key, cls.PROFILE_COEFFICIENTS["default"])

        pace_key = pace.value if hasattr(pace, "value") else str(pace).lower()
        pace_multiplier = cls.PACE_MULTIPLIERS.get(pace_key, 1.0)

        # Generated rest periods are not sightseeing visits and should not add
        # activity density or transfer load to the fatigue estimate.
        exertion_activities = [
            activity for activity in day.activities
            if activity.place_type != "rest_break" and activity.experience_tag != "rest_break"
        ]
        act_count = len(exertion_activities)
        # Transfers: Hotel -> 1 -> 2 -> ... -> N -> Hotel (N + 1 legs if N > 0)
        transfers = (act_count + 1) if act_count > 0 else 0

        # Raw score based on Blueprint Section 6 formulas
        raw_score = (
            (est_transit_km * coeffs["per_km"] * 0.3) +
            (act_count * coeffs["per_activity"] * 2.5) +
            (transfers * coeffs["per_transfer"] * 2.0)
        ) * pace_multiplier

        score = max(5, min(100, int(raw_score)))

        if score < 35:
            level = "Gentle Pace"
            badge_color = "emerald"
            advice = "Light physical demand with generous relaxation buffers."
        elif score < 65:
            level = "Moderate & Active"
            badge_color = "amber"
            advice = "Healthy balance of exploration and sightseeing."
        else:
            level = "High Exertion"
            badge_color = "rose"
            advice = "Demanding day with multiple stops. Stay hydrated and schedule restful pauses."

        if profile_key == "elderly":
            if est_transit_km > 15.0 or act_count > 2:
                advice = "⚠️ High walking load for senior travelers. Recommend wheelchair/golf-cart rentals where available."
        elif profile_key == "family":
            advice += " Child-friendly buffer times included."

        return {
            "score": score,
            "level": level,
            "badge_color": badge_color,
            "advice": advice,
            "stops_count": act_count,
            "est_transit_km": round(est_transit_km, 1),
            "group_profile": profile_key
        }

    @classmethod
    def evaluate_trip(
        cls, 
        days: List[DayPlan], 
        pace: PacePreference = PacePreference.BALANCED,
        group_profile: GroupProfile = GroupProfile.DEFAULT,
        total_transit_km: float = 30.0,
        hotel_lat: Optional[float] = None,
        hotel_lng: Optional[float] = None
    ) -> Dict[str, Any]:
        if not days:
            return {
                "trip_fatigue_score": 0,
                "overall_pace": "Relaxed",
                "group_profile": group_profile.value if hasattr(group_profile, "value") else str(group_profile),
                "daily_breakdown": []
            }

        daily_results = []
        fallback_km_per_day = total_transit_km / len(days) if days else 10.0

        for day in days:
            # Calculate actual route transit km for this specific day
            if hotel_lat is not None and hotel_lng is not None and day.activities:
                prev_lat, prev_lng = hotel_lat, hotel_lng
                day_km = 0.0
                for act in day.activities:
                    if act.lat is not None and act.lng is not None:
                        day_km += calculate_distance_km(prev_lat, prev_lng, act.lat, act.lng)
                        prev_lat, prev_lng = act.lat, act.lng
                # Return leg to hotel
                day_km += calculate_distance_km(prev_lat, prev_lng, hotel_lat, hotel_lng)
                actual_km = day_km
            else:
                actual_km = fallback_km_per_day

            eval_day = cls.evaluate_day(day, pace=pace, group_profile=group_profile, est_transit_km=actual_km)
            daily_results.append({
                "day_number": day.day_number,
                **eval_day
            })

        avg_score = int(sum(d["score"] for d in daily_results) / len(daily_results))
        
        if avg_score < 35:
            overall_level = "Relaxed & Restful"
        elif avg_score < 65:
            overall_level = "Balanced Exploration"
        else:
            overall_level = "High-Intensity Sightseeing"

        profile_key = group_profile.value if hasattr(group_profile, "value") else str(group_profile)

        return {
            "trip_fatigue_score": avg_score,
            "overall_pace": overall_level,
            "group_profile": profile_key,
            "daily_breakdown": daily_results
        }
