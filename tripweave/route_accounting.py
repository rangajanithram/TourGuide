"""Complete route estimates for edits, including hotel departure/return legs."""
from tripweave.distance import calculate_distance_km, get_travel_metrics


def trip_route_metrics(days, hotel, mode, people):
    distance, minutes, cost = 0.0, 0, 0
    for day in days:
        previous = hotel
        locations = [(a.lat, a.lng) for a in day.activities]
        if locations:
            locations.append(hotel)
        for location in locations:
            leg_time, leg_cost = get_travel_metrics(*previous, *location, mode=mode, people_count=people)
            km = calculate_distance_km(*previous, *location)
            distance += 0 if km < 0.01 else km * (1.25 if mode in ('cab','auto','walk') else 1)
            minutes += leg_time
            cost += leg_cost
            previous = location
    return distance, minutes, cost


def trip_transport_cost(days, hotel, mode, people):
    return trip_route_metrics(days, hotel, mode, people)[2]
