"""
Crowd Intelligence Heuristics for TripWeave Optimization Engine (Blueprint Section 7).
Estimates temporal crowd density and peak congestion patterns across attraction types
and day-of-week / time-of-day windows.
"""
from dataclasses import dataclass
from typing import List, Optional
from pydantic import BaseModel, Field

# Pydantic schema for API serialization
class CrowdForecast(BaseModel):
    score: int = Field(..., ge=0, le=100, description="Crowd density score (0-100, lower is less crowded)")
    level: str = Field(default="Moderate", description="'Low', 'Moderate', 'Busy', 'Very Busy'")
    reason: str = Field(..., description="Human-readable explanation of crowd pattern")
    confidence: str = Field(default="low", description="Confidence level: 'low' | 'medium' | 'high'")
    source: str = Field(default="heuristic", description="Provider source: 'heuristic' | 'besttime' | 'user_data'")

# Core Blueprint Section 7 Rule Matrix
CROWD_RULES = {
    "museum":        {"weekend_afternoon": 85, "weekday_morning": 20, "default": 50},
    "temple":        {"festival_day": 95, "morning_aarti_hour": 70, "default": 45},
    "fort":          {"weekend_noon": 80, "weekday_dawn": 15, "default": 40},
    "hilltop":       {"sunrise": 25, "weekend_noon": 85, "default": 55},
    "waterfall":     {"monsoon_weekend": 95, "weekday": 40, "default": 60},
    "market_bazaar": {"evening_5_9pm": 80, "morning": 30, "default": 55},
    "restaurant":    {"lunch_peak": 85, "dinner_peak": 85, "off_hours": 20},
    "mosque":        {"friday_noon": 95, "evening": 60, "default": 40},
    "church":        {"sunday_morning": 85, "weekday": 25, "default": 40},
    "zoo":           {"opening_hour": 30, "weekend_noon": 80, "default": 55},
    "beach":         {"sunset_weekend": 90, "morning_weekday": 20, "default": 50},
    "garden":        {"morning": 35, "midday_heat": 20, "evening": 65, "default": 40},
    "default":       {"default": 50},
}

class HeuristicCrowdProvider:
    """
    Blueprint Section 7 Heuristic Crowd Provider.
    Calculates deterministic crowd estimates without requiring external paid SaaS calls.
    """

    @classmethod
    def _detect_category(cls, place_type: str, tags: Optional[List[str]] = None) -> str:
        pt = (place_type or "").lower().strip()
        tag_set = {t.lower().strip() for t in (tags or [])}

        if pt == "restaurant" or "food" in tag_set or "dining" in tag_set or "lunch" in tag_set:
            return "restaurant"
        if "museum" in tag_set or "art" in tag_set or "gallery" in tag_set:
            return "museum"
        if "temple" in tag_set or "shrine" in tag_set:
            return "temple"
        if "mosque" in tag_set:
            return "mosque"
        if "church" in tag_set:
            return "church"
        if "fort" in tag_set or "fortress" in tag_set or "palace" in tag_set or "royal" in tag_set:
            return "fort"
        if "market" in tag_set or "bazaar" in tag_set or "shopping" in tag_set:
            return "market_bazaar"
        if "garden" in tag_set or "park" in tag_set or "nature" in tag_set:
            return "garden"
        if "viewpoint" in tag_set or "sunset" in tag_set or "panoramic" in tag_set:
            return "hilltop"
        
        return "default"

    @classmethod
    def get_forecast(
        cls,
        place_type: str,
        day_of_week: int,  # 0=Monday, 6=Sunday
        hour: int,         # 24-hour clock (e.g. 9 for 9:00 AM, 14 for 2:00 PM)
        tags: Optional[List[str]] = None,
        is_holiday: bool = False
    ) -> CrowdForecast:
        category = cls._detect_category(place_type, tags)
        is_weekend = (day_of_week >= 5)  # Saturday=5, Sunday=6
        rules = CROWD_RULES.get(category, CROWD_RULES["default"])

        score = rules.get("default", 50)
        reason = f"Normal visiting crowd for {category.replace('_', ' ')}."

        if category == "museum":
            if is_weekend and (13 <= hour <= 17):
                score = rules["weekend_afternoon"]
                reason = "Peak weekend afternoon museum crowd; expect ticket queues."
            elif not is_weekend and hour < 12:
                score = rules["weekday_morning"]
                reason = "Serene weekday morning hours with minimal museum footfall."
            elif is_weekend:
                score = 65
                reason = "Moderate weekend morning museum traffic."
            else:
                score = 40
                reason = "Light weekday visitor flow."

        elif category == "fort":
            if is_weekend and (11 <= hour <= 15):
                score = rules["weekend_noon"]
                reason = "Busy weekend midday period with high heat and group tours."
            elif hour <= 10:
                score = rules["weekday_dawn"] if not is_weekend else 30
                reason = "Optimal cool morning hours; fortress ramparts are peaceful."
            elif hour >= 16:
                score = 65 if is_weekend else 45
                reason = "Pleasant late afternoon golden-hour sightseers."
            else:
                score = 50
                reason = "Moderate steady visitors across fort courtyards."

        elif category == "restaurant":
            if 12 <= hour <= 14:
                score = rules["lunch_peak"]
                reason = "Peak lunch dining hour; table wait times likely."
            elif 19 <= hour <= 21:
                score = rules["dinner_peak"]
                reason = "Peak evening dinner rush."
            else:
                score = rules["off_hours"]
                reason = "Off-peak relaxed dining window with fast service."

        elif category == "temple":
            if is_holiday:
                score = rules["festival_day"]
                reason = "High holiday pilgrimage and devotional aarti rush."
            elif 7 <= hour <= 10:
                score = rules["morning_aarti_hour"]
                reason = "Morning prayers and darshan rush."
            elif 13 <= hour <= 16:
                score = 30
                reason = "Quiet afternoon lull between puja rituals."
            else:
                score = rules["default"]
                reason = "Standard evening devotional gathering."

        elif category == "market_bazaar":
            if 17 <= hour <= 21:
                score = rules["evening_5_9pm"]
                reason = "Bustling evening night market atmosphere with heavy foot traffic."
            elif hour <= 12:
                score = rules["morning"]
                reason = "Quiet morning opening hours before shoppers arrive."
            else:
                score = rules["default"]
                reason = "Moderate daytime bazaar trade."

        elif category == "garden":
            if hour <= 9:
                score = rules["morning"]
                reason = "Pleasant morning walkers and fresh floral air."
            elif 12 <= hour <= 15:
                score = rules["midday_heat"]
                reason = "Low foot traffic due to midday sun and heat."
            elif hour >= 16:
                score = rules["evening"]
                reason = "Popular sunset garden stroll hours."

        elif category == "hilltop":
            if hour >= 16 and hour <= 18:
                score = 80 if is_weekend else 65
                reason = "Prime sunset photography seekers gathering at viewpoint."
            elif hour <= 9:
                score = rules["sunrise"]
                reason = "Crisp early morning views with uncrowded vantage points."

        # Map score to descriptive level
        if score <= 35:
            level = "Low"
        elif score <= 65:
            level = "Moderate"
        elif score <= 85:
            level = "Busy"
        else:
            level = "Very Busy"

        return CrowdForecast(
            score=score,
            level=level,
            reason=reason,
            confidence="low",
            source="heuristic"
        )
