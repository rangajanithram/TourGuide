"""Bounded automatic discovery and meal resolution under explicit user assumptions."""
import hashlib
import re
from datetime import timedelta
from fastapi import HTTPException
from tripweave.models import ConfirmedDiscoveryStop, Place
from tripweave.distance import calculate_distance_km
from tripweave.preferences import preference_conflict


def expand_request(request, discovery, existing):
    policy = request.discovery_policy
    if policy is None:
        return request
    known = list(existing)
    stops = list(request.external_stops)
    # Always preserve user-confirmed/pinned inputs ahead of automatic suggestions.
    known.extend(stops)
    listings = []
    for category in ('attractions', 'restaurants'):
        listings.extend(discovery.search(request.destination + ', India', category)['places'][:12 if category == 'attractions' else 3])
    for item in listings:
        if item.get('category') != 'restaurants' and re.search(r'\b(graveyard|cemetery|burial ground|crematorium)\b', item['name'], re.IGNORECASE):
            continue
        if len(stops) >= 15:
            break
        if any(p.name.strip().casefold() == item['name'].strip().casefold() and
               calculate_distance_km(p.lat, p.lng, item['lat'], item['lng']) < 0.3 for p in known):
            continue
        restaurant = item['category'] == 'restaurants'
        identity = 'auto:' + hashlib.sha256(item['id'].encode()).hexdigest()[:32]
        if any(stop.place_id == identity for stop in stops):
            continue
        stop = ConfirmedDiscoveryStop(place_id=identity, name=item['name'][:200],
            lat=item['lat'], lng=item['lng'], place_type='restaurant' if restaurant else 'attraction',
            duration_minutes=45 if restaurant else policy.visit_minutes,
            estimated_cost_per_person_inr=policy.meal_cost_inr if restaurant else policy.attraction_cost_inr,
            open_time_mins=policy.open_time_mins, close_time_mins=policy.close_time_mins,
            formatted_address=(item.get('address') or '')[:300] or None)
        stops.append(stop)
        known.append(stop)
    if not stops and not listings:
        raise HTTPException(422, 'No discovery candidates were returned. Try again or disable automatic discovery and choose places manually.')
    return request.model_copy(update={'external_stops': stops}, deep=True)


def meal_candidates(request, places, base):
    """Use affordable suitable catalog venues, otherwise retain an honest base block."""
    if request.meal_budget_per_person is None or request.food_preference == 'own_meals':
        return []
    pins = {pin.strip().casefold() for pin in request.locked_activities}
    restaurants = [p for p in places if p.place_type == 'restaurant' and not p.meal_type
                   and p.place_id.casefold() not in pins and p.name.casefold() not in pins
                   and not preference_conflict(p, request)
                   and p.estimated_cost_per_person_inr <= request.meal_budget_per_person]
    meals = []
    for day in range(request.days):
        earliest = request.arrival_available_mins if day == 0 else 60
        latest = request.departure_deadline_mins if day == request.days - 1 else 720
        for kind, start, end in [('breakfast', 60, 180), ('lunch', 240, 420), ('dinner', 630, 720)]:
            start, end = max(start, earliest), min(end, latest)
            if end - start < 30:
                continue
            eligible = [p for p in restaurants if p.open_time_mins is not None and p.close_time_mins is not None
                        and min(end, p.close_time_mins) - max(start, p.open_time_mins) >= p.duration_minutes
                        and p.duration_minutes <= end - start
                        and (not request.start_date or (request.start_date + timedelta(days=day)).strftime('%A').lower() not in [d.lower() for d in p.closed_days])]
            eligible.sort(key=lambda p: (calculate_distance_km(base.lat, base.lng, p.lat, p.lng) +
                                        1.5 * sum(m.meal_venue_id == p.place_id for m in meals),
                                        p.estimated_cost_per_person_inr, p.place_id))
            venue = eligible[0] if eligible else None
            if venue:
                meals.append(venue.model_copy(update={'place_id': f'meal:{day}:{kind}',
                    'name': f'{kind.title()} - {venue.name}'[:200], 'planning_day': day, 'meal_type': kind,
                    'meal_venue_id': venue.place_id, 'open_time_mins': max(start, venue.open_time_mins),
                    'close_time_mins': min(end, venue.close_time_mins)}, deep=True))
            else:
                meals.append(Place(place_id=f'meal:{day}:{kind}', name=f'{kind.title()} - arrange venue',
                    place_type='restaurant', lat=base.lat, lng=base.lng, duration_minutes=30,
                    estimated_cost_per_person_inr=request.meal_budget_per_person,
                    open_time_mins=start, close_time_mins=end, planning_day=day, meal_type=kind,
                    verification_status='estimated', last_verified_date=None,
                    source_reference='Reserved meal time at base; user budget estimate; suitable venue not confirmed'))
    return meals
