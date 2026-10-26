"""Schedule required full-day visits as linked parts with an onsite lunch break.

Visit length is an elapsed planning block, including a disclosed 30-minute lunch.
No restaurant, opening hour, booking or transport evidence is invented here.
"""
from datetime import timedelta
from fastapi import HTTPException
from tripweave.availability import planning_windows
from tripweave.distance import get_travel_metrics
from tripweave.models import Place


def excursion_options(request, p, base, windows):
    mode = request.transport_pref.mode if request.transport_pref else request.transport_mode or 'cab'
    mode = getattr(mode, 'value', mode)
    if getattr(request.group_profile, 'value', request.group_profile) == 'elderly' and mode == 'walk':
        mode = 'auto'
    outward, _ = get_travel_metrics(base.lat, base.lng, p.lat, p.lng, mode, request.people_count)
    back, _ = get_travel_metrics(p.lat, p.lng, base.lat, base.lng, mode, request.people_count)
    before = (p.duration_minutes - 30)//2
    after = p.duration_minutes - 30 - before
    choices = []
    for day, window in enumerate(windows):
        if (request.start_date + timedelta(days=day)).strftime('%A').lower() in {v.lower() for v in p.closed_days}:
            continue
        start = max(p.open_time_mins or 0, window['start'] + 30 + outward)
        lunch = max(240, start + before)
        finish = lunch + 30 + after
        if (lunch + 30 <= 420 and finish <= (p.close_time_mins if p.close_time_mins is not None else 720)
                and max(630, finish + back) + 30 <= window['end']):
            choices.append(day)
    return choices, outward, back


def prepare_excursions(request, places, base, meals, preferred_days):
    pins = {v.strip().casefold() for v in request.locked_activities}
    required = [p for p in places if p.place_type == 'attraction' and p.duration_minutes >= 300
                and (p.place_id.casefold() in pins or p.name.casefold() in pins)]
    replacements, continuations, notes, early_days = {}, [], {}, set()
    if not required or request.meal_budget_per_person is None or request.food_preference == 'own_meals':
        return replacements, continuations, meals, early_days, notes
    # The first day's explicit arrival remains a hard bound. Later dedicated
    # excursion days may start at 08:00, still respecting travel/stay availability.
    windows = planning_windows(request, early_start_days=range(1, request.days))
    allocated = set()
    for p in sorted(required, key=lambda p: (-p.duration_minutes, p.place_id)):
        options, outward, back = excursion_options(request, p, base, windows)
        before = (p.duration_minutes - 30) // 2
        after = p.duration_minutes - 30 - before
        choices = [day for day in options if day not in allocated]
        if not choices:
            raise HTTPException(422, detail=(f'Full-day visit conflict: {p.name} needs a {p.duration_minutes // 60}-hour visit block '
                f'plus about {outward + back} minutes of return travel from {base.name}. '
                'It cannot fit the available day, listed closing time and meal breaks. '
                'In Journey, choose a closer stay or earlier arrival; in Travel style, try faster transport; '
                'or remove this must-visit in Places & food.'))
        day = min(choices, key=lambda d: (d != preferred_days.get(p.place_id), d))
        allocated.add(day)
        if day > 0:
            early_days.add(day)
        lunch_id = f'meal:{day}:lunch'
        child_id = f'visit:{p.place_id}:after_lunch'
        root_close = min(p.close_time_mins if p.close_time_mins is not None else 720, 420 + after) - after - 30
        replacements[p.place_id] = p.model_copy(update={'duration_minutes':before, 'planning_day':day,
            'close_time_mins':root_close, 'visit_parent_id':p.place_id, 'visit_part':'before_lunch',
            'name':f'{p.name} — before lunch'[:160]}, deep=True)
        continuations.append(p.model_copy(update={'place_id':child_id,'name':f'{p.name} — after lunch'[:160],
            'duration_minutes':after, 'planning_day':day,'estimated_cost_per_person_inr':0,'entry_fee_inr':0,
            'visit_parent_id':p.place_id,'visit_part':'after_lunch','depends_on':[p.place_id,lunch_id]}, deep=True))
        meals = [m for m in meals if m.planning_day != day]
        for kind, location, start, end in [('breakfast',base,windows[day]['start'],180),
                                         ('lunch',p,240,min(420,(p.close_time_mins or 720)-after)),
                                         ('dinner',base,630,windows[day]['end'])]:
            meals.append(Place(place_id=f'meal:{day}:{kind}',name=f'{kind.title()} — arrange at {"visit" if kind == "lunch" else "stay"}',
                place_type='restaurant',lat=location.lat,lng=location.lng,duration_minutes=30,
                estimated_cost_per_person_inr=request.meal_budget_per_person,planning_day=day,meal_type=kind,
                open_time_mins=start,close_time_mins=end,verification_status='estimated',last_verified_date=None,
                visit_parent_id=p.place_id if kind=='lunch' else None,
                depends_on=[p.place_id] if kind=='lunch' else [],
                source_reference='Reserved meal time and user budget estimate. Food venue, service and walking time are not confirmed.'))
        notes[day] = (f'Full-day visit: {p.name}. The {p.duration_minutes // 60}-hour estimated visit block includes a '
            '30-minute lunch break, shown between two visit parts. '
            + ('Start from your stay at 08:00. ' if day in early_days else '')
            + 'Breakfast and dinner are reserved at your stay; confirm food arrangements and venue hours.')
    return replacements, continuations, meals, early_days, notes


def verify_excursions(plan, lookup, people, minutes):
    """Check original catalog visit length, contiguous parts and a single ticket."""
    errors = []
    parent_ids = {a.visit_parent_id for d in plan.days for a in d.activities if a.visit_parent_id}
    for parent_id in parent_ids:
        original = lookup.get(parent_id.casefold())
        entries = [(d.day_number, i, a) for d in plan.days for i, a in enumerate(d.activities) if a.visit_parent_id == parent_id]
        parts = [a for _, _, a in entries]
        valid = (original is not None and original.place_type == 'attraction' and original.duration_minutes >= 300 and len(parts) == 3
                 and [a.visit_part for a in parts] == ['before_lunch', None, 'after_lunch']
                 and len({d for d, _, _ in entries}) == 1
                 and [i for _, i, _ in entries] == list(range(entries[0][1], entries[0][1]+3)))
        if valid:
            root, lunch, child = parts
            try:
                durations = [minutes(a.end_time)-minutes(a.start_time) for a in parts]
            except ValueError:
                errors.append(f'Full-day visit {parent_id}: invalid visit times.')
                continue
            before = (original.duration_minutes - 30)//2
            valid = (root.place_id == parent_id and lunch.meal_type == 'lunch'
                     and child.place_id == f'visit:{parent_id}:after_lunch'
                     and durations == [before, 30, original.duration_minutes-30-before]
                     and root.estimated_cost_inr == original.estimated_cost_per_person_inr*people
                     and child.estimated_cost_inr == 0
                     and all((a.lat,a.lng) == (original.lat,original.lng) for a in parts)
                     and minutes(root.start_time) >= (original.open_time_mins or 0)
                     and minutes(child.end_time) <= (original.close_time_mins if original.close_time_mins is not None else 720))
        if not valid:
            errors.append(f'Full-day visit {parent_id}: linked visit parts, lunch, original visit length or ticket cost do not match. Regenerate the plan.')
    # An attached continuation cannot disappear along with its parent marker.
    for child in plan.visit_continuations:
        if (not child.visit_parent_id or child.place_id != f'visit:{child.visit_parent_id}:after_lunch'
                or child.visit_part != 'after_lunch' or child.place_type != 'attraction'
                or child.estimated_cost_per_person_inr != 0):
            errors.append('Invalid full-day continuation reference or ticket cost.')
        if child.visit_parent_id not in parent_ids:
            errors.append('A required full-day visit or its continuation is missing.')
    return errors
