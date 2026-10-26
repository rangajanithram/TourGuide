"""Bounded constructive warm start; OR-Tools and Stage 8 still validate it.

Uses the optimizer's actual directional time/fare matrices, never new estimates.
Failure here means only that this heuristic found no seed, not infeasibility.
"""
import time
from datetime import timedelta
from functools import lru_cache


def initial_routes(optimizer, time_matrix, max_visits):
    o = optimizer
    deadline = time.monotonic() + 1.0
    depot = o.hotel_index
    places = o.places
    routes = [[] for _ in range(o.days)]
    used = set()
    pins = set(o.locked_activities)
    lookup = {key: i for i, p in enumerate(places) for key in (p.place_id.casefold(), p.name.casefold())}
    dependencies = {i: [lookup.get(dep.strip().casefold()) for dep in p.depends_on] for i, p in enumerate(places)}
    mandatory = {i for i, p in enumerate(places) if i != depot and
                 (p.planning_day is not None or p.place_id.casefold() in pins or p.name.casefold() in pins)}
    available_budget = None if o.max_total_budget is None else o.max_total_budget - (o.hotel_summary.total_cost_inr if o.hotel_summary else 0)

    @lru_cache(maxsize=4096)
    def metrics(day, route):
        clock = o.day_windows[day]['start']
        end = o.day_windows[day]['end']
        previous = depot
        cost = transit_cost = visits = 0
        seen = set()
        for node in route:
            p = places[node]
            if p.planning_day is not None and p.planning_day != day:
                return None
            if o.start_date and (o.start_date + timedelta(days=day)).strftime('%A').lower() in [d.lower() for d in p.closed_days]:
                return None
            # Parents already placed must precede the child on this same day.
            # Missing parents are checked once every mandatory node is inserted.
            if any(dep is not None and dep in used and dep not in seen for dep in dependencies[node]):
                return None
            travel = time_matrix[previous][node] - places[previous].duration_minutes
            clock = max(clock + travel, p.open_time_mins or 0) + p.duration_minutes
            if clock > (p.close_time_mins if p.close_time_mins is not None else 720):
                return None
            fare = o.cost_matrix[previous][node]
            transit_cost += fare
            cost += fare + p.estimated_cost_per_person_inr * o.people_count
            visits += not bool(p.meal_type)
            if visits > max_visits:
                return None
            previous = node
            seen.add(node)
        if route:
            clock += time_matrix[previous][depot] - places[previous].duration_minutes
            cost += o.cost_matrix[previous][depot]
            transit_cost += o.cost_matrix[previous][depot]
        return (cost, transit_cost, clock) if clock <= end else None

    def insertion(node, day):
        old = metrics(day, tuple(routes[day]))
        totals = [metrics(d, tuple(route)) for d, route in enumerate(routes)]
        if old is None or any(m is None for m in totals):
            return None
        best = None
        for position in range(len(routes[day]) + 1):
            route = routes[day][:position] + [node] + routes[day][position:]
            new = metrics(day, tuple(route))
            if new is None:
                continue
            cost = sum(m[0] for m in totals) - old[0] + new[0]
            transit = sum(m[1] for m in totals) - old[1] + new[1]
            if available_budget is not None and cost > available_budget:
                continue
            if o.max_transport_budget is not None and transit > o.max_transport_budget:
                continue
            value = new[0] - old[0] + (new[2] - old[2]) * 5
            if best is None or value < best[0]:
                best = value, route
        return best

    # Fixed-date meal windows first; then required stops and their prerequisites.
    pending = set(mandatory)
    while pending:
        if time.monotonic() > deadline:
            return None
        ready = [i for i in pending if all(dep in used for dep in dependencies[i])]
        if not ready:
            return None
        node = min(ready, key=lambda i: (places[i].planning_day is None,
            places[i].close_time_mins if places[i].close_time_mins is not None else 720, places[i].place_id))
        p = places[node]
        days = [p.planning_day] if p.planning_day is not None else range(o.days)
        options = [(candidate[0], day, candidate[1]) for day in days
                   if 0 <= day < o.days and (candidate := insertion(node, day)) is not None]
        if not options:
            return None
        _, day, routes[day] = min(options, key=lambda row: (row[0], row[1]))
        used.add(node)
        pending.remove(node)
        metrics.cache_clear()  # Dependency checks depend on the placed set.

    interests = {v.casefold() for v in o.interests}
    def reward(node):
        p = places[node]
        return (2000 + 400 * p.featured + 1500 * bool(interests.intersection(t.casefold() for t in p.tags))
                + 1800 * (p.place_id.casefold() in o.preferred_activities or p.name.casefold() in o.preferred_activities))

    # Small, useful seed. The full catalog remains available to the optimizer.
    optional = sorted((i for i, p in enumerate(places) if i != depot and i not in used and p.place_type == 'attraction'),
                      key=lambda i: (-reward(i), places[i].place_id))[:64]
    for count in range(1, max_visits + 1):
        for day in range(o.days):
            if time.monotonic() > deadline:
                return routes
            if sum(not places[i].meal_type for i in routes[day]) >= count:
                continue
            options = []
            for node in optional:
                if node in used or any(dep not in routes[day] for dep in dependencies[node]):
                    continue
                candidate = insertion(node, day)
                if candidate:
                    options.append((reward(node) - candidate[0], node, candidate[1]))
            if options:
                _, node, routes[day] = max(options, key=lambda row: (row[0], -row[1]))
                used.add(node)
                metrics.cache_clear()
    return routes
