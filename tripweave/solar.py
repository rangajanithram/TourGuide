"""
Solar and Astronomical Time Calculator for TripWeave.
Calculates Golden Hour and Sunset windows using the NOAA Solar Position Algorithm.
Uses true latitude, longitude, and day-of-year solar declination and equation of time.
"""
import math
from datetime import date
from typing import Optional, Tuple

def get_golden_hour_window(lat: float, lng: float, target_date: Optional[date] = None, month: int = 10) -> Tuple[int, int]:
    """
    Calculates true solar sunset and golden-hour window relative to our 8:00 AM day start (Minute 0).
    Uses the NOAA Solar Position Algorithm:
    1. Day-of-year fractional solar angle (gamma).
    2. Equation of time (eqtime) in minutes.
    3. Solar declination angle (decl).
    4. Solar hour angle at sunset with 90.833° atmospheric refraction.
    5. Converts Solar Noon & Sunset from UTC to IST (UTC + 5:30).
    
    Returns:
        (golden_hour_start_mins, sunset_mins) from 8:00 AM.
    """
    if target_date:
        day_of_year = target_date.timetuple().tm_yday
    else:
        # Approximate day of year from month (assuming 15th of month)
        day_of_year = int((month - 0.5) * 30.5)

    # Fractional year in radians
    gamma = 2.0 * math.pi / 365.0 * (day_of_year - 1)

    # Equation of time in minutes
    eqtime = 229.18 * (
        0.000075 
        + 0.001868 * math.cos(gamma) 
        - 0.032077 * math.sin(gamma) 
        - 0.014615 * math.cos(2.0 * gamma) 
        - 0.040849 * math.sin(2.0 * gamma)
    )

    # Solar declination in radians
    decl = (
        0.006918 
        - 0.399912 * math.cos(gamma) 
        + 0.070257 * math.sin(gamma) 
        - 0.006758 * math.cos(2.0 * gamma) 
        + 0.000907 * math.sin(2.0 * gamma) 
        - 0.002697 * math.cos(3.0 * gamma) 
        + 0.00148 * math.sin(3.0 * gamma)
    )

    phi = math.radians(lat)
    # Zenith angle for sunrise/sunset is 90.833 degrees (accounting for atmospheric refraction)
    cos_zenith = math.cos(math.radians(90.833))
    cos_hour_angle = (cos_zenith - math.sin(phi) * math.sin(decl)) / (math.cos(phi) * math.cos(decl))

    # Clamp to [-1.0, 1.0] for extreme latitudes
    cos_hour_angle = max(-1.0, min(1.0, cos_hour_angle))
    hour_angle_deg = math.degrees(math.acos(cos_hour_angle))

    # Solar noon and sunset in UTC minutes from midnight
    noon_utc = 720.0 - 4.0 * lng - eqtime
    sunset_utc = noon_utc + 4.0 * hour_angle_deg

    # Convert UTC to Indian Standard Time (IST is UTC + 5:30 = +330 minutes)
    sunset_ist_minute = sunset_utc + 330.0

    # Convert to minutes relative to 8:00 AM (minute 480 of the day)
    sunset_from_8am = int(sunset_ist_minute - 480.0)

    # Golden Hour is defined as the 60 minutes leading up to astronomical sunset
    golden_hour_start = max(0, sunset_from_8am - 60)
    golden_hour_end = sunset_from_8am

    return golden_hour_start, golden_hour_end
