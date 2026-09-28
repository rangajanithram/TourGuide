"""
Open-Meteo Weather Integration Provider (Blueprint Section 4 & 12).
Fetches live astronomical temperature and precipitation forecasts up to 16 days
with deterministic climatological fallback for 100% offline resilience and dates beyond 16 days.
"""
import json
import time
import urllib.request
from datetime import date, timedelta
from typing import Dict, Optional, Tuple
from tripweave.models import WeatherSummary

def _wmo_code_to_condition(code: int) -> str:
    """Translates WMO weather interpretation code into human condition."""
    if code == 0:
        return "Clear Sky"
    elif code in [1, 2]:
        return "Partly Cloudy"
    elif code == 3:
        return "Overcast"
    elif code in [45, 48]:
        return "Foggy"
    elif code in [51, 53, 55, 61, 63, 65, 80, 81, 82]:
        return "Rain Showers"
    elif code in [95, 96, 99]:
        return "Thunderstorm"
    return "Partly Cloudy"

def _seasonal_fallback(target_date: Optional[date] = None) -> WeatherSummary:
    """Deterministic climatological fallback when offline or beyond 16-day forecast window."""
    d = target_date or date.today()
    month = d.month

    if month in [11, 12, 1, 2]: # Winter
        temp = 29.0
        rain = 5
        cond = "Sunny & Mild"
        heat = False
        advisory = "Typical pleasant winter climate. Ideal for walking tours and daytime monuments."
    elif month in [3, 4, 5]: # Summer
        temp = 38.5
        rain = 8
        cond = "Sunny & Warm"
        heat = True
        advisory = "Typical warm summer climate. Stay hydrated and avoid unshaded courtyards during midday."
    elif month in [6, 7, 8, 9]: # Monsoon
        temp = 31.0
        rain = 50
        cond = "Passing Showers"
        heat = False
        advisory = "Typical monsoon climate with intermittent showers. Plan indoor stops during rain."
    else: # October post-monsoon
        temp = 31.5
        rain = 15
        cond = "Partly Cloudy"
        heat = False
        advisory = "Typical mild post-monsoon climate. Good visibility for evening viewpoints."

    return WeatherSummary(
        condition=cond,
        max_temp_c=temp,
        precipitation_probability_pct=rain,
        heat_advisory=heat,
        advisory_text=advisory,
        is_forecast=False
    )

class WeatherProvider:
    """
    Retrieves weather forecasts for destination coordinates and trip dates.
    Requests Open-Meteo with 16-day forecast window with in-memory bounded TTL caching.
    """
    _cache: Dict[str, Tuple[float, Dict[str, WeatherSummary]]] = {}
    _CACHE_MAX_SIZE: int = 128
    _CACHE_TTL_SECONDS: float = 3600.0  # 1 hour fresh forecast TTL

    @classmethod
    def get_daily_forecasts(
        cls, 
        lat: float, 
        lng: float, 
        start_date: Optional[date] = None, 
        end_date: Optional[date] = None,
        days: Optional[int] = None
    ) -> Dict[str, WeatherSummary]:
        start = start_date or date.today()
        if end_date:
            total_days = max(1, (end_date - start).days + 1)
        elif days:
            total_days = max(1, days)
        else:
            total_days = 3

        cache_key = f"{round(lat, 2)}_{round(lng, 2)}_{start.isoformat()}_{total_days}"
        now = time.time()
        if cache_key in cls._cache:
            cached_at, cached_forecasts = cls._cache[cache_key]
            if (now - cached_at) <= cls._CACHE_TTL_SECONDS:
                return {k: v.model_copy(deep=True) for k, v in cached_forecasts.items()}
            else:
                del cls._cache[cache_key]

        forecasts: Dict[str, WeatherSummary] = {}

        # 1. Attempt live Open-Meteo call with 16-day forecast horizon
        live_data = None
        try:
            url = (
                f"https://api.open-meteo.com/v1/forecast?"
                f"latitude={lat:.4f}&longitude={lng:.4f}&"
                f"daily=weather_code,temperature_2m_max,precipitation_probability_max&"
                f"forecast_days=16&"
                f"timezone=auto"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "TripWeave-TravelEngine/1.0"})
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                if resp.status == 200:
                    payload = json.loads(resp.read().decode("utf-8"))
                    live_data = payload.get("daily", {})
        except Exception:
            live_data = None

        # 2. Build daily forecast map for every day in the trip range
        w_code_key = "weather_code" if live_data and "weather_code" in live_data else "weathercode"

        for i in range(total_days):
            day_d = start + timedelta(days=i)
            day_str = day_d.isoformat()

            matched = False
            if live_data and "time" in live_data:
                time_list = live_data.get("time", [])
                if day_str in time_list:
                    idx = time_list.index(day_str)
                    w_codes = live_data.get(w_code_key, [0])
                    temps = live_data.get("temperature_2m_max", [30.0])
                    rains = live_data.get("precipitation_probability_max", [0])

                    w_code = int(w_codes[idx]) if idx < len(w_codes) and w_codes[idx] is not None else 0
                    temp_max = float(temps[idx]) if idx < len(temps) and temps[idx] is not None else 30.0
                    rain_prob = int(rains[idx]) if idx < len(rains) and rains[idx] is not None else 0

                    cond = _wmo_code_to_condition(w_code)
                    heat = temp_max >= 38.0

                    if rain_prob >= 40:
                        adv = f"Live forecast: Rain likely ({rain_prob}%). Carry an umbrella and plan indoor stops during downpours."
                    elif heat:
                        adv = f"Live forecast: High heat advisory ({temp_max:.1f}°C). Avoid strenuous midday walking."
                    else:
                        adv = f"Live forecast: Pleasant outdoor sightseeing conditions ({temp_max:.1f}°C)."

                    forecasts[day_str] = WeatherSummary(
                        condition=cond,
                        max_temp_c=round(temp_max, 1),
                        precipitation_probability_pct=rain_prob,
                        heat_advisory=heat,
                        advisory_text=adv,
                        is_forecast=True
                    )
                    matched = True

            if not matched:
                forecasts[day_str] = _seasonal_fallback(day_d)

        # Evict oldest entry if cache capacity reached
        if len(cls._cache) >= cls._CACHE_MAX_SIZE:
            oldest_key = min(cls._cache.keys(), key=lambda k: cls._cache[k][0])
            del cls._cache[oldest_key]

        cls._cache[cache_key] = (now, forecasts)
        return forecasts
