"""
Open-Meteo Weather Integration Provider (Blueprint Section 4 & 12).
Fetches live astronomical temperature and precipitation forecasts
with deterministic climatological fallback for 100% offline resilience.
"""
import json
import urllib.request
from datetime import date, timedelta
from typing import Dict, Optional
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
    """Deterministic climatological fallback when offline or beyond 14-day forecast window."""
    d = target_date or date.today()
    month = d.month

    if month in [11, 12, 1, 2]: # Winter
        temp = 29.0
        rain = 5
        cond = "Sunny & Mild"
        heat = False
        advisory = "Pleasant winter weather. Ideal for walking tours and daytime monuments."
    elif month in [3, 4, 5]: # Summer
        temp = 38.5
        rain = 8
        cond = "Sunny & Warm"
        heat = True
        advisory = "Warm summer conditions. Stay hydrated and avoid unshaded courtyards during midday."
    elif month in [6, 7, 8, 9]: # Monsoon
        temp = 31.0
        rain = 50
        cond = "Passing Showers"
        heat = False
        advisory = "Monsoon showers possible. Carry an umbrella or plan museum visits during rain."
    else: # October post-monsoon
        temp = 31.5
        rain = 15
        cond = "Partly Cloudy"
        heat = False
        advisory = "Mild post-monsoon climate. Excellent visibility for evening viewpoints."

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
    """

    @classmethod
    def get_daily_forecasts(
        cls, 
        lat: float, 
        lng: float, 
        start_date: Optional[date] = None, 
        days: int = 1
    ) -> Dict[str, WeatherSummary]:
        start = start_date or date.today()
        forecasts: Dict[str, WeatherSummary] = {}

        # 1. Attempt live Open-Meteo call
        live_data = None
        try:
            url = (
                f"https://api.open-meteo.com/v1/forecast?"
                f"latitude={lat:.4f}&longitude={lng:.4f}&"
                f"daily=weathercode,temperature_2m_max,precipitation_probability_max&"
                f"timezone=auto"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "TripWeave-TravelEngine/1.0"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                if resp.status == 200:
                    payload = json.loads(resp.read().decode("utf-8"))
                    live_data = payload.get("daily", {})
        except Exception:
            live_data = None

        # 2. Build daily forecast map
        for i in range(days):
            day_d = start + timedelta(days=i)
            day_str = day_d.isoformat()

            matched = False
            if live_data and "time" in live_data:
                time_list = live_data.get("time", [])
                if day_str in time_list:
                    idx = time_list.index(day_str)
                    w_code = live_data.get("weathercode", [0])[idx]
                    temp_max = float(live_data.get("temperature_2m_max", [30.0])[idx] or 30.0)
                    rain_prob = int(live_data.get("precipitation_probability_max", [0])[idx] or 0)

                    cond = _wmo_code_to_condition(w_code)
                    heat = temp_max >= 38.0

                    if rain_prob >= 40:
                        adv = f"Rain likely ({rain_prob}%). Carry an umbrella and plan indoor stops during downpours."
                    elif heat:
                        adv = f"High heat advisory ({temp_max:.1f}°C). Avoid strenuous midday walking."
                    else:
                        adv = f"Pleasant outdoor sightseeing conditions ({temp_max:.1f}°C)."

                    forecasts[day_str] = WeatherSummary(
                        condition=cond,
                        max_temp_c=temp_max,
                        precipitation_probability_pct=rain_prob,
                        heat_advisory=heat,
                        advisory_text=adv,
                        is_forecast=True
                    )
                    matched = True

            if not matched:
                forecasts[day_str] = _seasonal_fallback(day_d)

        return forecasts
