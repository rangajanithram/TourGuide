"""Evidence-based preference filtering shared by generation and verification."""
from tripweave.models import Place, TripRequest


def preference_conflict(place: Place, request: TripRequest):
    if place.meal_type and not place.meal_venue_id:
        return None  # Reserved time at base; user chooses a suitable venue later.
    if place.place_type in {"hotel", "rest_break"}:
        return None
    if request.max_visit_minutes and place.duration_minutes > request.max_visit_minutes:
        return f"{place.name} exceeds your maximum visit length of {request.max_visit_minutes} minutes."
    if request.avoid_climbing and place.requires_climbing is not False:
        return f"{place.name} requires climbing or has no verified climbing information."
    if place.place_type == "restaurant":
        if request.food_preference == "own_meals":
            return f"{place.name} conflicts with your choice to arrange your own meals."
        if request.food_preference != "any" and request.food_preference not in place.dietary_options:
            return f"{place.name} has no catalog evidence for {request.food_preference} food."
    return None
