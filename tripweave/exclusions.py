"""Evidence-based omission hints, not invented solver proofs."""
from datetime import timedelta
from tripweave.availability import planning_windows
from tripweave.distance import calculate_distance_km
from tripweave.models import ExclusionReason
from tripweave.preferences import preference_conflict


def exclusion_hints(plan, request, candidates):
    used = {a.place_id for d in plan.days for a in d.activities}
    used.update(a.meal_venue_id for d in plan.days for a in d.activities if a.meal_venue_id)
    pace = getattr(request.pace, 'value', request.pace)
    limit = {'relaxed': 2, 'balanced': 3, 'intensive': 4}.get(pace, 3)
    if getattr(request.group_profile, 'value', request.group_profile) == 'elderly':
        limit = max(1, limit - 1)
    full = bool(plan.days) and all(sum(not a.meal_type and a.place_type != 'rest_break' and a.visit_part != 'after_lunch'
                                    for a in d.activities) >= limit for d in plan.days)
    windows = planning_windows(request)
    left = max(0, request.budget_inr - plan.total_cost_inr)
    result = []
    for p in candidates:
        if p.place_type == 'hotel' or p.meal_type or p.place_id in used:
            continue
        category, message, action = 'route_choice', 'Other stops fit this route better.', 'Make this a must-visit in Places & food to plan around it.'
        conflict = preference_conflict(p, request)
        dates = [day for day in range(request.days) if not request.start_date or
                 (request.start_date + timedelta(days=day)).strftime('%A').lower() not in {v.lower() for v in p.closed_days}]
        fitting = [day for day in dates if min(p.close_time_mins if p.close_time_mins is not None else 720, windows[day]['end'])
                   - max(p.open_time_mins or 0, windows[day]['start']) >= p.duration_minutes]
        visits = [[a for a in d.activities if a.place_type == 'attraction'] for d in plan.days]
        nearest_area = min((min(calculate_distance_km(p.lat, p.lng, a.lat, a.lng) for a in day)
                            for day in visits if day), default=0)
        ticket = (p.estimated_cost_per_person_inr or p.entry_fee_inr or 0) * request.people_count
        if conflict:
            category, message, action = 'preference', conflict, 'Check your choices in Travel style or Places & food.'
        elif not dates:
            category, message, action = 'closed_on_day', 'Closed on every date in this trip, according to the listed hours.', 'Choose another date and confirm the hours with the venue.'
        elif not fitting:
            category, message, action = 'operating_hours', 'The listed visit length does not fit your available hours.', 'Check arrival, departure and visit times in your trip settings.'
        elif p.place_type == 'restaurant':
            category, message, action = 'meal_choice', 'Other meal stops were chosen along the route.', 'Choose this restaurant in Places & food if you want to include it.'
        elif nearest_area > 5:
            category, message, action = 'geographic_detour', f'About {nearest_area:.0f} km from the nearest planned visit. It may need a separate area or day.', 'Pin it to plan around this area, or add another day.'
        elif ticket > left:
            category, message, action = 'budget_limit', f'Tickets are about ₹{ticket:,} for your group; ₹{left:,} is left in this plan.', 'Swap another stop or raise the destination budget in Journey.'
        elif full:
            category, message = 'pace_limit', f'Each day already has {limit} stops at your chosen pace. Meal breaks are separate.'
            action = ('Try Balanced or Intensive in Travel style, or swap a stop.' if pace == 'relaxed' else
                      'Try Intensive in Travel style, or swap a stop.' if pace == 'balanced' else 'Swap a stop or add another day in Journey.')
        result.append(ExclusionReason(place_name=p.name, category=category, reason=message, suggested_action=action))
    return result
