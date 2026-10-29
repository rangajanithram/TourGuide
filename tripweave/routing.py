"""Bounded server-fetched road evidence; no network calls in solver callbacks.

Use a Free Geoapify project with its provider-side quota enabled. The local
credit budget is an additional process-local backstop, not a global quota.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
import hashlib
import json
import math
import threading
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode
from tripweave.config import settings

_current = ContextVar('tripweave_routes', default=None)


def point(lat, lng):
    return round(float(lat), 6), round(float(lng), 6)


def profile(mode):
    return 'walk' if mode == 'walk' else 'drive' if mode in ('cab', 'auto') else None


class RoadProvider:
    def __init__(self, key, daily_credits=1000, opener=urlopen):
        self.key, self.limit, self.opener = key, daily_credits, opener
        self.lock = threading.Lock()
        self.day, self.spent = None, 0
        self.cache = {}
        self.cooldown_until = 0

    def matrix(self, points, mode):
        if not self.key:
            return {}, 'Road service is not configured; distance-based estimates are used.', None
        if len(points) > 25:
            return {}, 'This trip exceeds the free routing size limit; distance-based estimates are used.', None
        digest = hashlib.sha256(json.dumps([mode, points]).encode()).hexdigest()
        # Reserve baseline credits plus one surcharge per cell. Inputs are local;
        # unexpected long routes are rejected rather than triggering more calls.
        reserve = len(points) * min(len(points), 10) + len(points) ** 2
        with self.lock:
            cached = self.cache.get(digest)
            if cached and time.monotonic() - cached[0] < 1800:
                return cached[1], '', cached[2]
            for cached in self.cache.values():
                if cached[3] == mode and time.monotonic() - cached[0] < 1800 and all((a, b) in cached[1] for a in points for b in points):
                    return {(a, b): cached[1][(a, b)] for a in points for b in points}, '', cached[2]
            if time.monotonic() < self.cooldown_until:
                return {}, 'Road service is temporarily unavailable; distance-based estimates are used.', None
            today = datetime.now(timezone.utc).date()
            if self.day != today:
                self.day, self.spent = today, 0
            if self.spent + reserve > self.limit:
                return {}, 'The free routing allowance is reached; distance-based estimates are used.', None
            self.spent += reserve  # Failed/uncertain calls are not refunded or retried.
        body = {'mode': mode, 'sources': [{'location': [lng, lat]} for lat, lng in points],
                'targets': [{'location': [lng, lat]} for lat, lng in points], 'units': 'metric'}
        if mode == 'drive':
            body.update(traffic='approximated', max_speed=40)
        request = Request('https://api.geoapify.com/v1/routematrix?' + urlencode({'apiKey': self.key}),
                          data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}, method='POST')
        try:
            with self.opener(request, timeout=6) as response:
                raw = response.read(262145)
            if len(raw) > 262144:
                raise ValueError('Oversized response')
            matrix = json.loads(raw)['sources_to_targets']
            if len(matrix) != len(points) or any(not isinstance(row, list) or len(row) != len(points) for row in matrix):
                raise ValueError('Invalid matrix')
            edges = {}
            for i, row in enumerate(matrix):
                for j, cell in enumerate(row):
                    distance, seconds = cell['distance'], cell['time']
                    if cell.get('source_index', i) != i or cell.get('target_index', j) != j:
                        raise ValueError('Wrong matrix indexes')
                    if distance is None and seconds is None:
                        edges[(points[i], points[j])] = None
                    elif (isinstance(distance, bool) or isinstance(seconds, bool)
                          or not isinstance(distance, (float, int)) or not isinstance(seconds, (float, int))
                          or not math.isfinite(distance) or not math.isfinite(seconds)
                          or not 0 <= distance < 500000 or not 0 <= seconds <= 172800):
                        raise ValueError('Invalid route')
                    else:
                        edges[(points[i], points[j])] = distance / 1000, seconds / 60
            checked = datetime.now(timezone.utc).isoformat()
            with self.lock:
                self.cache = {k: v for k, v in self.cache.items() if time.monotonic() - v[0] < 1800}
                if len(self.cache) >= 32:
                    del self.cache[next(iter(self.cache))]
                self.cache[digest] = time.monotonic(), edges, checked, mode
            return edges, '', checked
        except Exception as error:
            # Never log URLs/exceptions containing the server-only API key.
            with self.lock:
                self.cooldown_until = time.monotonic() + 60
                if isinstance(error, HTTPError) and error.code in (402, 429):
                    self.spent = self.limit
            return {}, 'Road service is unavailable; distance-based estimates are used.', None


road_provider = RoadProvider(settings.geoapify_api_key, settings.routing_daily_credits)


@contextmanager
def road_context(enabled, places, mode='cab', priority=()):
    p = profile(getattr(mode, 'value', mode))
    points = sorted({point(place.lat, place.lng) for place in places})
    partial = len(points) > 25
    if partial:
        preferred = list(dict.fromkeys(point(p.lat, p.lng) for p in priority))[:25]
        anchor = preferred[0] if preferred else points[0]
        remaining = sorted((p for p in points if p not in preferred), key=lambda p:(p[0]-anchor[0])**2+(p[1]-anchor[1])**2)
        points = sorted((preferred + remaining)[:25])
    edges, note, checked = {}, 'Distance-based travel estimates; road routing was not requested.', None
    if enabled and p:
        if points and any(abs(lat - points[0][0]) > 2 or abs(lng - points[0][1]) > 2 for lat, lng in points):
            note = 'Road routing is limited to nearby city stops; distance-based estimates are used.'
        elif len(points) > 1:
            edges, note, checked = road_provider.matrix(points, p)
            if edges and partial:
                note = 'Road data covers a bounded set of candidates; other legs use distance-based estimates.'
        else:
            note = 'All stops use the same map location; no local travel is needed.'
    elif enabled:
        note = 'Metro times use a general estimate, not a verified rail route.'
    token = _current.set({'edges': edges, 'profile': p, 'note': note, 'checked_at': checked})
    try:
        yield
    finally:
        _current.reset(token)


def route_edge(lat1, lng1, lat2, lng2, mode):
    context = _current.get()
    key = point(lat1, lng1), point(lat2, lng2)
    if context and context['profile'] == profile(mode) and key in context['edges']:
        return True, context['edges'][key]
    return False, None


def route_summary():
    c = _current.get()
    return {'source': 'Geoapify / OpenStreetMap' if c and c['edges'] else 'distance_estimate',
            'checked_at': c['checked_at'] if c else None,
            'note': c['note'] if c and c['note'] else 'Road routes with estimated traffic, pickup time and fares; not live traffic or a price quote.'}


def annotate_plan(plan):
    from tripweave.distance import get_travel_metrics
    from tripweave.verifier import _time_str_to_minutes
    plan.routing_summary = route_summary()
    road, estimated, blocked = 0, 0, 0
    if plan.hotel_summary:
        base = (plan.hotel_summary.lat, plan.hotel_summary.lng)
        for day in plan.days:
            previous = base
            for current in [(a.lat,a.lng) for a in day.activities] + ([base] if day.activities else []):
                if point(*previous) != point(*current):
                    found, edge = route_edge(*previous,*current,plan.transport_mode)
                    if found and edge is not None: road += 1
                    elif found: blocked += 1
                    else: estimated += 1
                previous = current
    plan.routing_summary.update(road_legs=road,estimated_legs=estimated,unreachable_legs=blocked)
    if road == 0:
        plan.routing_summary['source'] = 'distance_estimate'
        plan.routing_summary['checked_at'] = None
        if _current.get() and _current.get()['edges']:
            plan.routing_summary['note'] = 'No road data covers these selected legs; distance-based estimates are used.'
    if road and estimated:
        plan.routing_summary['note'] += f' {road} local legs use road data; {estimated} use distance estimates.'
    if blocked:
        plan.routing_summary['note'] += f' {blocked} selected legs have no road connection.'
    basis = ('Geoapify road model with distance estimates where needed; fares and traffic are estimates.' if estimated else
             'Geoapify road model; fares and traffic are estimates.') if plan.routing_summary['source'] != 'distance_estimate' else plan.routing_summary['note']
    for day in plan.days:
        previous = (plan.hotel_summary.lat, plan.hotel_summary.lng) if plan.hotel_summary else None
        previous_end = None
        for activity in day.activities:
            activity.travel_minutes_from_previous = None
            activity.free_minutes_before = None
            if previous is not None:
                activity.travel_minutes_from_previous = get_travel_metrics(*previous, activity.lat, activity.lng,
                    mode=plan.transport_mode)[0]  # Party size affects fares, not travel minutes.
                if previous_end is not None:
                    activity.free_minutes_before = max(0, _time_str_to_minutes(activity.start_time)
                        - previous_end - activity.travel_minutes_from_previous)
            previous = (activity.lat, activity.lng)
            previous_end = _time_str_to_minutes(activity.end_time)
        note = (day.planning_note or '').split('Travel basis:')[0].strip()
        day.planning_note = (note + ' Travel basis: ' + basis).strip()[:500]


@contextmanager
def editor_road_context(plan, destination):
    from tripweave.provider import get_places_provider
    places = list(get_places_provider().get_places(destination)) + list(plan.planning_preferences.external_stops)
    places.extend(a for day in plan.days for a in day.activities)
    if plan.hotel_summary:
        places.append(plan.hotel_summary)
    priority = ([plan.hotel_summary] if plan.hotel_summary else []) + [a for d in plan.days for a in d.activities]
    with road_context(plan.planning_preferences.use_road_routes, places, plan.transport_mode, priority):
        yield
