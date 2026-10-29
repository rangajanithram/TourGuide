"""Bounded automatic discovery and meal resolution under explicit user assumptions."""
import hashlib
import re
from datetime import timedelta
from fastapi import HTTPException
from tripweave.models import ConfirmedDiscoveryStop, Place
from tripweave.distance import calculate_distance_km, get_travel_metrics
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


def meal_candidates(request, places, base, day_groups=None):
    """Use affordable suitable catalog venues, otherwise retain an honest base block."""
    if request.meal_budget_per_person is None or request.food_preference == 'own_meals':
        return []
    pins = {pin.strip().casefold() for pin in request.locked_activities}
    restaurants = [p for p in places if p.place_type == 'restaurant' and not p.meal_type and 'snack_only' not in p.tags
                   and p.place_id.casefold() not in pins and p.name.casefold() not in pins
                   and not preference_conflict(p, request)
                   and p.estimated_cost_per_person_inr <= request.meal_budget_per_person]
    # Discovery/catalog aliases for one physical venue must not defeat variety.
    unique = []
    for place in restaurants:
        if not any(place.name.strip().casefold() == old.name.strip().casefold()
                   and calculate_distance_km(place.lat, place.lng, old.lat, old.lng) < 0.15
                   for old in unique):
            unique.append(place)
    restaurants = unique
    meals = []
    from tripweave.availability import planning_windows
    windows = planning_windows(request)
    mode = request.transport_pref.mode if request.transport_pref else request.transport_mode or 'cab'
    mode = getattr(mode, 'value', mode)
    if getattr(request.group_profile, 'value', request.group_profile) == 'elderly' and mode == 'walk':
        mode = 'auto'

    def reachable_meal(venue, start, end, earliest, latest):
        outward, _ = get_travel_metrics(base.lat, base.lng, venue.lat, venue.lng, mode, request.people_count)
        back, _ = get_travel_metrics(venue.lat, venue.lng, base.lat, base.lng, mode, request.people_count)
        finish = max(start, venue.open_time_mins, earliest + outward) + venue.duration_minutes
        return finish <= min(end, venue.close_time_mins) and finish + back <= latest
    for day in range(request.days):
        earliest, latest = windows[day]['start'], windows[day]['end']
        from tripweave.locality import medoid
        group = (day_groups or {}).get(day, [])
        area = medoid(group) if group else base
        used_today = set()
        for kind, start, end in [('breakfast', 60, 180), ('lunch', 240, 420), ('dinner', 630, 720)]:
            start, end = max(start, earliest), min(end, latest)
            if end - start < 30:
                continue
            eligible = [p for p in restaurants if p.open_time_mins is not None and p.close_time_mins is not None
                        and (not any(t in p.tags for t in ('breakfast','lunch','dinner')) or kind in p.tags)
                        and min(end, p.close_time_mins) - max(start, p.open_time_mins) >= p.duration_minutes
                        and p.duration_minutes <= end - start
                        and reachable_meal(p, start, end, earliest, latest)
                        and (not request.start_date or (request.start_date + timedelta(days=day)).strftime('%A').lower() not in [d.lower() for d in p.closed_days])]
            def distance(a, b):
                return calculate_distance_km(a.lat, a.lng, b.lat, b.lng)
            def detour(p):
                if kind == 'lunch':
                    return 2 * distance(area, p)
                return max(0, distance(base, p) + distance(p, area) - distance(base, area)) + .5 * distance(base, p)
            available = [p for p in eligible if p.place_id not in used_today]
            # Variety only among nearby choices. Never cross town for a fresh
            # restaurant when a suitable one is beside the day's visits.
            if available:
                closest = min(detour(p) for p in available)
                available = [p for p in available if detour(p) <= closest + 2]
                if group and kind == 'lunch':
                    available = [p for p in available if distance(area, p) <= 4]
            available.sort(key=lambda p: (sum(m.meal_venue_id == p.place_id for m in meals),
                                        sum(m.meal_venue_id == p.place_id and m.meal_type == kind for m in meals),
                                        detour(p),
                                        p.estimated_cost_per_person_inr, p.place_id))
            venue = available[0] if available else None
            if venue:
                used_today.add(venue.place_id)
                meals.append(venue.model_copy(update={'place_id': f'meal:{day}:{kind}',
                    'name': f'{kind.title()} - {venue.name}'[:200], 'planning_day': day, 'meal_type': kind,
                    'meal_venue_id': venue.place_id, 'open_time_mins': max(start, venue.open_time_mins),
                    'close_time_mins': min(end, venue.close_time_mins)}, deep=True))
            else:
                meeting = area if group and kind == 'lunch' else base
                meals.append(Place(place_id=f'meal:{day}:{kind}', name=f'{kind.title()} - arrange venue',
                    place_type='restaurant', lat=meeting.lat, lng=meeting.lng, duration_minutes=30,
                    estimated_cost_per_person_inr=request.meal_budget_per_person,
                    open_time_mins=start, close_time_mins=end, planning_day=day, meal_type=kind,
                    verification_status='estimated', last_verified_date=None,
                    source_reference=('Meal time near the shown meeting point; venue and walking time not confirmed. User budget estimate. '
                                      + ('No different suitable restaurant is available near this day’s route for this meal; add more choices or enable discovery.' if eligible
                                         else 'No nearby restaurant fits the listed hours, meal budget and food requirements.'))))
    return meals


def reserve_pinned_meals(request, places, base, meals, day_groups=None):
    """A required restaurant can supply one meal, rather than a second lunch.

    Keep its original ID/name, ticket estimate and pin. Full-day onsite meals
    stay linked. Dates, venue hours and both base commutes must still fit.
    """
    if not meals:
        return meals
    pins = {v.strip().casefold() for v in request.locked_activities}
    required = sorted((p for p in places if p.place_type == 'restaurant' and not p.meal_type
                       and (p.place_id.casefold() in pins or p.name.casefold() in pins)),
                      key=lambda p: (p.close_time_mins or 720, p.place_id))
    result = list(meals)
    replaced = set()
    from tripweave.availability import planning_windows
    windows = planning_windows(request)
    mode = request.transport_pref.mode if request.transport_pref else request.transport_mode or 'cab'
    mode = getattr(mode, 'value', mode)
    if getattr(request.group_profile, 'value', request.group_profile) == 'elderly' and mode == 'walk':
        mode = 'auto'
    for venue in required:
        kinds = set(venue.tags) & {'breakfast', 'lunch', 'dinner'}
        if 'snack_only' in venue.tags:
            continue
        options = []
        for index, meal in enumerate(result):
            if index in replaced or meal.visit_parent_id or (kinds and meal.meal_type not in kinds):
                continue
            day = meal.planning_day
            if request.start_date and (request.start_date + timedelta(days=day)).strftime('%A').lower() in {d.lower() for d in venue.closed_days}:
                continue
            # The required venue replaces the previous choice. Its hours must
            # not be clipped by the unrelated restaurant we are replacing.
            meal_start, meal_end = {'breakfast': (60, 180), 'lunch': (240, 420), 'dinner': (630, 720)}[meal.meal_type]
            start = max(meal_start, windows[day]['start'], venue.open_time_mins or 0)
            end = min(meal_end, windows[day]['end'], venue.close_time_mins if venue.close_time_mins is not None else 720)
            outward, _ = get_travel_metrics(base.lat, base.lng, venue.lat, venue.lng, mode, request.people_count)
            back, _ = get_travel_metrics(venue.lat, venue.lng, base.lat, base.lng, mode, request.people_count)
            if max(start, windows[day]['start'] + outward) + venue.duration_minutes > min(end, windows[day]['end'] - back):
                continue
            group = (day_groups or {}).get(day, [])
            distance = min((calculate_distance_km(venue.lat, venue.lng, p.lat, p.lng) for p in group), default=0)
            options.append((distance, day, index, start, end))
        if not options:
            raise HTTPException(422, detail=(f'Pinned meal conflict: {venue.name} cannot fit a meal on these dates with the listed hours and travel times. '
                'Add a day or change this required restaurant in Places & food.'))
        _, day, index, start, end = min(options)
        result[index] = venue.model_copy(update={'planning_day': day, 'meal_type': result[index].meal_type,
            'meal_venue_id': venue.place_id, 'open_time_mins': start, 'close_time_mins': end}, deep=True)
        replaced.add(index)
    return result
