"""Bounded nearby insertion/relocation, validated by the original routing model.

Never remove existing visits, relax pace, move meals between days, invent a
shorter visit, or change road data. Failure leaves the verified solver result.
"""
import time
from tripweave.solar import get_golden_hour_window
from datetime import timedelta


def fill_schedule_gaps(optimizer, manager, routing, solution, time_matrix):
    o = optimizer
    dimension = routing.GetDimensionOrDie('Time')
    deadline = time.monotonic() + .6
    attempts = 0

    def routes_for(assignment):
        routes = []
        for day in range(o.days):
            index = assignment.Value(routing.NextVar(routing.Start(day)))
            route = []
            while not routing.IsEnd(index):
                route.append(manager.IndexToNode(index))
                index = assignment.Value(routing.NextVar(index))
            routes.append(route)
        return routes

    def score(assignment, routes):
        waiting = golden = travel = 0
        for day, route in enumerate(routes):
            for a, b in zip(route, route[1:]):
                idle = (assignment.Min(dimension.CumulVar(manager.NodeToIndex(b)))
                        - assignment.Min(dimension.CumulVar(manager.NodeToIndex(a))) - time_matrix[a][b])
                # Fill daytime gaps first, then useful pre-dinner time. Keep
                # a small rest allowance; pace remains a hard model constraint.
                waiting += max(0, idle - 30) * (.5 if o.places[b].meal_type == 'dinner' else 1)
            for node in route:
                p = o.places[node]
                if p.golden_hour_recommended and o.start_date:
                    gh, _ = get_golden_hour_window(p.lat, p.lng, o.start_date + timedelta(days=day))
                    start = assignment.Min(dimension.CumulVar(manager.NodeToIndex(node)))
                    golden += max(0, gh - p.duration_minutes // 2 - start)
            travel += sum(o.distance_matrix[a][b] for a, b in zip([o.hotel_index] + route, route + [o.hotel_index]))
        return waiting * 10 + golden * (2 if 'sunset' in o.interests else .5) + travel * 20

    routes = routes_for(solution)
    best_score = score(solution, routes)
    # Up to two changes per trip date, under a shared time/attempt budget.
    for _ in range(min(2 * o.days, 14)):
        used = {node for route in routes for node in route}
        improved = False
        for day, route in enumerate(routes):
            for position in range(1, len(route)):
                a, b = route[position-1:position+1]
                if (o.places[a].visit_parent_id and
                        o.places[a].visit_parent_id == o.places[b].visit_parent_id):
                    continue
                idle = solution.Min(dimension.CumulVar(manager.NodeToIndex(b))) - solution.Min(dimension.CumulVar(manager.NodeToIndex(a))) - time_matrix[a][b]
                if idle < 45:
                    continue
                candidates = [node for node, p in enumerate(o.places) if node not in (a, b, o.hotel_index)
                    and p.place_type == 'attraction' and not p.visit_part
                    and (node not in used or node in route)
                    and p.duration_minutes <= idle
                    and min(o.distance_matrix[a][node], o.distance_matrix[node][b]) <= 3
                    and o.distance_matrix[a][node] + o.distance_matrix[node][b] - o.distance_matrix[a][b] <= 3]
                candidates.sort(key=lambda node: (node not in used,
                    o.distance_matrix[a][node] + o.distance_matrix[node][b], o.places[node].place_id))
                for node in candidates:
                    if time.monotonic() > deadline or attempts >= 80:
                        return solution
                    attempts += 1
                    changed = [n for n in route if n != node]
                    changed.insert(changed.index(b), node)
                    trial_routes = [list(r) for r in routes]
                    trial_routes[day] = changed
                    trial = routing.ReadAssignmentFromRoutes(
                        [[manager.NodeToIndex(n) for n in r] for r in trial_routes], True)
                    if trial is None:
                        continue
                    trial_score = score(trial, trial_routes)
                    if trial_score + 1 < best_score:
                        solution, routes, best_score = trial, trial_routes, trial_score
                        improved = True
                        break
                if improved:
                    break
            if improved:
                break
        if not improved:
            break
    return solution
