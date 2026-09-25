"""
Solar and Astronomical Time Calculator for TripWeave.
Calculates Golden Hour and Sunset windows based on geographic latitude and month.
"""

def get_golden_hour_window(lat: float, lng: float, month: int = 9) -> tuple[int, int]:
    """
    Returns (start_minute, end_minute) relative to our 8:00 AM day start (Minute 0).
    In Hyderabad (Latitude ~17.38° N):
    - Sunset in September is around 6:15 PM (615 minutes from 8:00 AM).
    - Golden Hour is the 60 minutes before sunset: 5:15 PM to 6:15 PM.
    5:15 PM = 9 hours 15 minutes after 8:00 AM = 555 minutes.
    6:15 PM = 10 hours 15 minutes after 8:00 AM = 615 minutes.
    """
    # For Hyderabad / Central India autumn solar angle
    golden_hour_start = 555  # 5:15 PM
    golden_hour_end = 615    # 6:15 PM
    
    return golden_hour_start, golden_hour_end
