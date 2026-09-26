"""
Fatigue & Pace Engine (Stage 7 of Engineering Blueprint).
Computes physical fatigue scores based on transit distance, transfers,
activity density, and user pace preferences.
"""
from typing import Dict, Any, List
from tripweave.models import DayPlan, PacePreference

class FatigueAnalyzer:
    """
    Evaluates physical exertion, travel density, and pacing realism
    to ensure itineraries remain enjoyable and sustainable.
    """

    FATIGUE_COEFFICIENTS = {
        "relaxed":   {"per_km": 0.8, "per_activity": 6.0, "per_transfer": 3.0},
        "balanced":  {"per_km": 1.2, "per_activity": 8.0, "per_transfer": 4.5},
        "intensive": {"per_km": 1.6, "per_activity": 11.0, "per_transfer": 6.0},
    }

    @classmethod
    def evaluate_day(
        cls, 
        day: DayPlan, 
        pace: PacePreference = PacePreference.BALANCED,
        est_transit_km: float = 15.0
    ) -> Dict[str, Any]:
        pace_key = pace.value if hasattr(pace, "value") else str(pace).lower()
        coeffs = cls.FATIGUE_COEFFICIENTS.get(pace_key, cls.FATIGUE_COEFFICIENTS["balanced"])

        act_count = len(day.activities)
        transfers = max(0, act_count) # transfers between stops + depot return

        # Raw score
        raw_score = (
            est_transit_km * coeffs["per_km"] +
            act_count * coeffs["per_activity"] +
            transfers * coeffs["per_transfer"]
        )

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
            advice = "Demanding day with multiple stops. Stay hydrated and take rest pauses."

        return {
            "score": score,
            "level": level,
            "badge_color": badge_color,
            "advice": advice,
            "stops_count": act_count,
            "est_transit_km": round(est_transit_km, 1)
        }

    @classmethod
    def evaluate_trip(
        cls, 
        days: List[DayPlan], 
        pace: PacePreference = PacePreference.BALANCED,
        total_transit_km: float = 30.0
    ) -> Dict[str, Any]:
        if not days:
            return {
                "trip_fatigue_score": 0,
                "overall_pace": "Relaxed",
                "daily_breakdown": []
            }

        daily_results = []
        km_per_day = total_transit_km / len(days) if days else 10.0

        for day in days:
            eval_day = cls.evaluate_day(day, pace=pace, est_transit_km=km_per_day)
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

        return {
            "trip_fatigue_score": avg_score,
            "overall_pace": overall_level,
            "daily_breakdown": daily_results
        }
