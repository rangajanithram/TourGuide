"""
Solar and Astronomical Time Calculator for TripWeave.
Calculates Golden Hour and Sunset windows based on geographic latitude and month.
"""

def get_golden_hour_window(lat: float, lng: float, month: int = 9) -> tuple[int, int]:
    """
    Returns (start_minute, end_minute) relative to our 8:00 AM day start (Minute 0).
    North India (Delhi/Jaipur ~27-29° N):
      - Sunset in autumn is around 5:45 PM (585 minutes from 8:00 AM).
      - Golden Hour: 4:45 PM to 5:45 PM (525 to 585 minutes).
    South / Central India (Hyderabad ~17.4° N):
      - Sunset in autumn is around 6:15 PM (615 minutes from 8:00 AM).
      - Golden Hour: 5:15 PM to 6:15 PM (555 to 615 minutes).
    """
    if lat > 24.0:
        # Northern India (Delhi, Jaipur, Agra)
        golden_hour_start = 525  # 4:45 PM
        golden_hour_end = 585    # 5:45 PM
    else:
        # Central & Southern India (Hyderabad, Bangalore, Mumbai)
        golden_hour_start = 555  # 5:15 PM
        golden_hour_end = 615    # 6:15 PM
    
    return golden_hour_start, golden_hour_end
