"""Soft neighborhood guides. Never remove candidates or weaken required stops."""
from datetime import timedelta
from tripweave.clustering import GeoClusterer
from tripweave.distance import calculate_distance_km, get_travel_metrics
from tripweave.availability import planning_windows


def medoid(places):
    """Use an actual place nearest the others, rather than a fictitious centroid."""
    return min(places, key=lambda a: (sum(calculate_distance_km(a.lat, a.lng, b.lat, b.lng)
                                        for b in places), a.place_id))


def day_neighborhoods(request, places, base, groups=None):
    """Choose compact, different daily areas before choosing meal venues.

    DBSCAN finds broad neighborhoods; complete-link refinement bounds chaining.
    Greedy workload packing supplies soft day guides to the routing solver.
    Closures, short days and required places inform guides, but OR-Tools and the
    independent verifier still decide whether a complete route is feasible.
    """
    attractions = [p for p in places if p.place_type == 'attraction']
    if not attractions:
        return {}, {}
    clusterer = GeoClusterer()
    if groups is None:
        groups = clusterer.compact_clusters(clusterer.cluster_places(attractions))
    pace = getattr(request.pace, 'value', request.pace)
    capacity = {'relaxed': 2, 'balanced': 3, 'intensive': 4}.get(pace, 3)
    if getattr(request.group_profile, 'value', request.group_profile) == 'elderly':
        capacity = max(1, capacity - 1)
    interests = {t.casefold() for t in request.interests}
    pins = {v.casefold().strip() for v in request.locked_activities}
    preferred = {v.casefold().strip() for v in request.preferred_activities}
    mode = request.transport_pref.mode if request.transport_pref else request.transport_mode or 'cab'
    mode = getattr(mode, 'value', mode)
    if getattr(request.group_profile, 'value', request.group_profile) == 'elderly' and mode == 'walk':
        mode = 'auto'

    def pinned(p):
        return p.place_id.casefold() in pins or p.name.casefold() in pins

    def value(p):
        return (2000 + 400 * p.featured + 1500 * bool(interests.intersection(t.casefold() for t in p.tags))
                + 1800 * (p.place_id.casefold() in preferred or p.name.casefold() in preferred))

    chunks = []
    for identity, group in groups.items():
        remaining = sorted(group, key=lambda p: (-pinned(p), -value(p), p.place_id))
        while remaining:
            chunk = [remaining.pop(0)]
            while remaining and len(chunk) < capacity:
                anchor = medoid(chunk)
                next_place = min(remaining, key=lambda p: (-pinned(p),
                    calculate_distance_km(anchor.lat, anchor.lng, p.lat, p.lng), -value(p), p.place_id))
                chunk.append(next_place)
                remaining.remove(next_place)
            chunks.append((identity, chunk))

    windows = planning_windows(request)
    result, used_areas, selected = {}, set(), set()

    def open_on(p, day):
        return (not request.start_date or (request.start_date + timedelta(days=day)).strftime('%A').lower()
                not in {name.lower() for name in p.closed_days})

    # Short travel/stay windows choose first, so full days retain larger groups.
    for day in sorted(range(request.days), key=lambda d: (windows[d]['end'] - windows[d]['start'], d)):
        if windows[day]['end'] - windows[day]['start'] < 90:
            continue
        choices = []
        for index, (area, chunk) in enumerate(chunks):
            usable = [p for p in chunk if open_on(p, day) and
                      min(p.close_time_mins if p.close_time_mins is not None else 720, windows[day]['end'])
                      - max(p.open_time_mins or 0, windows[day]['start']) >= p.duration_minutes]
            if index in selected or not usable:
                continue
            anchor = medoid(usable)
            commute = sum(get_travel_metrics(a.lat, a.lng, b.lat, b.lng, mode, request.people_count)[0]
                          for a, b in ((base, anchor), (anchor, base)))
            fits = sum(p.duration_minutes for p in usable) + commute <= windows[day]['end'] - windows[day]['start']
            choices.append(((any(pinned(p) for p in usable), fits, area not in used_areas,
                             sum(value(p) for p in usable) - commute * 12, -index), index, area, usable))
        if choices:
            _, index, area, result[day] = max(choices, key=lambda row: row[0])
            selected.add(index)
            used_areas.add(area)

    anchors = {day: medoid(group) for day, group in result.items()}
    preferences = {p.place_id: day for day, group in result.items() for p in group}
    for p in attractions:
        if p.place_id in preferences or not anchors:
            continue
        available = [day for day in anchors if open_on(p, day)]
        if available:
            preferences[p.place_id] = min(available, key=lambda d: (
                calculate_distance_km(p.lat, p.lng, anchors[d].lat, anchors[d].lng), d))
    return result, preferences
