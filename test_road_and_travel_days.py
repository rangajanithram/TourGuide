"""Road evidence, free-budget fallbacks and calendar-aware stay boundaries."""
import json
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError

from tripweave import routing
from tripweave.routing import RoadProvider, road_context
from tripweave.distance import get_travel_metrics, route_distance_km, calculate_distance_km
from tripweave.models import TripRequest, StayChoice, TripPlan
from tripweave.availability import planning_windows, lodging_nights
from tripweave.main import _build_single_plan
from tripweave.verifier import ItineraryVerifier
from tripweave.provider import get_places_provider

A = SimpleNamespace(lat=17.38, lng=78.48)
B = SimpleNamespace(lat=17.39, lng=78.49)


class Response:
    def __init__(self, payload):
        self.raw = json.dumps(payload).encode()
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, limit): return self.raw[:limit]


def matrix_body():
    return {'sources_to_targets': [[{'distance': 0, 'time': 0}, {'distance': 10000, 'time': 600}],
                                  [{'distance': 20000, 'time': 1200}, {'distance': 0, 'time': 0}]]}


class RoadTests(unittest.TestCase):
    def test_directional_road_distance_time_and_fares_share_one_evidence_source(self):
        calls = []
        def opener(request, timeout):
            calls.append(json.loads(request.data))
            self.assertEqual(timeout, 6)
            return Response(matrix_body())
        provider = RoadProvider('fictional-test-key', opener=opener)
        with patch.object(routing, 'road_provider', provider):
            with road_context(True, [A, B], 'cab'):
                self.assertEqual(route_distance_km(A.lat,A.lng,B.lat,B.lng), 10)
                self.assertEqual(get_travel_metrics(A.lat,A.lng,B.lat,B.lng), (32, 250))
                self.assertEqual(get_travel_metrics(B.lat,B.lng,A.lat,A.lng), (57, 450))
                self.assertEqual(routing.route_summary()['source'], 'Geoapify / OpenStreetMap')
            self.assertNotEqual(get_travel_metrics(A.lat,A.lng,B.lat,B.lng), (32, 250), 'evidence cannot leak to another request')
            with road_context(True, [A, B], 'auto'):
                self.assertEqual(get_travel_metrics(A.lat,A.lng,B.lat,B.lng,'auto'), (35, 157))
        self.assertEqual(len(calls), 1, 'cab and auto reuse driving evidence')
        self.assertEqual(len(provider.matrix([(A.lat,A.lng)],'drive')[0]),1)
        self.assertEqual(len(calls),1,'edits can reuse a smaller subset without another provider call')
        self.assertEqual(calls[0]['sources'][0]['location'], [78.48, 17.38])
        self.assertEqual(calls[0]['traffic'], 'approximated')

    def test_disabled_unconfigured_and_exhausted_budget_make_no_requests(self):
        def unexpected(*args, **kwargs): raise AssertionError('Network call not allowed')
        points = [(A.lat,A.lng),(B.lat,B.lng)]
        self.assertIn('not configured', RoadProvider(None, opener=unexpected).matrix(points,'drive')[1])
        self.assertIn('allowance', RoadProvider('test',0,opener=unexpected).matrix(points,'drive')[1])
        with patch.object(routing, 'road_provider', RoadProvider('test',opener=unexpected)):
            with road_context(False,[A,B]): self.assertEqual(routing.route_summary()['source'],'distance_estimate')
            with road_context(True,[A,B],'metro'): self.assertIn('not a verified rail route',routing.route_summary()['note'])

    def test_timeout_has_safe_fallback_and_no_retry_storm_or_key_leak(self):
        calls = []
        def fail(*args, **kwargs): calls.append(1); raise TimeoutError('private-key-must-not-leak')
        provider = RoadProvider('private-key-must-not-leak',opener=fail)
        for _ in range(3):
            result, note, checked = provider.matrix([(A.lat,A.lng),(B.lat,B.lng)],'drive')
            self.assertEqual(result,{})
            self.assertNotIn('private-key', note)
            self.assertIsNone(checked)
        self.assertEqual(len(calls),1)

    def test_invalid_matrix_is_rejected_and_known_unreachable_is_not_a_shortcut(self):
        for value in [-1, float('nan'), True, 600000]:
            body = matrix_body(); body['sources_to_targets'][0][1]['distance'] = value
            provider = RoadProvider('test',opener=lambda *a, **k: Response(body))
            self.assertEqual(provider.matrix([(A.lat,A.lng),(B.lat,B.lng)],'drive')[0],{})
        body = matrix_body(); body['sources_to_targets'][0][1] = {'distance':None,'time':None}
        with patch.object(routing,'road_provider',RoadProvider('test',opener=lambda *a,**k:Response(body))):
            with road_context(True,[A,B]): self.assertEqual(get_travel_metrics(A.lat,A.lng,B.lat,B.lng),(1440,0))

    def test_quota_response_stops_further_paid_or_retry_requests(self):
        def fail(*a, **k): raise HTTPError('https://example.invalid',429,'quota',{},None)
        provider = RoadProvider('test',opener=fail)
        provider.matrix([(A.lat,A.lng),(B.lat,B.lng)],'drive')
        self.assertEqual(provider.spent,provider.limit)

    def test_large_matrix_stays_inside_free_feature_bounds(self):
        provider = RoadProvider('test',opener=lambda *a,**k: self.fail('Must not request oversized matrix'))
        self.assertIn('size limit',provider.matrix([(17+i/1000,78) for i in range(26)],'drive')[1])

    def test_large_catalog_keeps_priority_points_without_dropping_other_candidates(self):
        places = [SimpleNamespace(lat=17.38+i/10000,lng=78.48) for i in range(30)]
        def roads(points, mode):
            self.assertEqual(len(points),25)
            self.assertIn((places[-1].lat,places[-1].lng),points)
            return {(a,b):(1,5) for a in points for b in points},'', '2026-10-25T00:00:00+00:00'
        with patch.object(routing.road_provider,'matrix',side_effect=roads):
            with road_context(True,places,'cab',[places[-1]]):
                self.assertIn('other legs',routing.route_summary()['note'])
        self.assertEqual(len(places),30)

    def test_server_route_matrix_is_used_by_optimizer_and_independent_verifier(self):
        def roads(points, mode):
            return {(a,b):(calculate_distance_km(*a,*b)*1.6,calculate_distance_km(*a,*b)*4) for a in points for b in points},'', '2026-10-25T00:00:00+00:00'
        req = TripRequest(destination='hyderabad', days=1, start_date='2026-11-02', people_count=1, budget_inr=10000,use_road_routes=True)
        with patch.object(routing.road_provider,'matrix',side_effect=roads):
            plan = _build_single_plan(req)
            self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
            self.assertEqual(plan.routing_summary['source'],'Geoapify / OpenStreetMap')
            self.assertTrue(plan.planning_preferences.use_road_routes)
            self.assertIn('Travel basis:',plan.days[0].planning_note)
            reopened = TripPlan.model_validate_json(plan.model_dump_json())
            self.assertEqual(reopened.routing_summary,plan.routing_summary)


class TravelDayTests(unittest.TestCase):
    def journey(self, **changes):
        values = dict(outbound_departure='2026-11-01T22:00+05:30',destination_arrival='2026-11-02T23:00+05:30',
                      destination_departure='2026-11-04T07:00+05:30',return_arrival='2026-11-04T19:00+05:30',
                      arrival_buffer_minutes=120,departure_buffer_minutes=90)
        values.update(changes); return values

    def request(self, **changes):
        values = dict(destination='hyderabad',origin_city='bengaluru',start_date='2026-11-02',end_date='2026-11-04',
                      budget_inr=25000,people_count=1,journey_timing=self.journey())
        values.update(changes); return TripRequest(**values)

    def test_late_arrival_and_early_departure_reserve_only_usable_days(self):
        req = self.request()
        self.assertEqual([(w['start'],w['end']) for w in planning_windows(req)],[(0,0),(60,720),(0,0)])
        self.assertEqual(lodging_nights(req),2)
        plan = _build_single_plan(req)
        self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
        self.assertFalse(plan.days[0].activities); self.assertFalse(plan.days[2].activities)
        self.assertTrue(plan.days[1].activities)
        self.assertIn('Travel, rest',plan.days[0].planning_note)
        self.assertEqual(plan.fatigue_report['daily_breakdown'][0]['est_transit_km'],0)

    def test_travel_nights_outside_sightseeing_dates_are_counted(self):
        req = self.request(start_date='2026-11-03',end_date='2026-11-03')
        self.assertEqual(req.days,1); self.assertEqual(lodging_nights(req),2)
        plan = _build_single_plan(req)
        self.assertEqual(plan.hotel_summary.nights,2)
        self.assertEqual(plan.hotel_summary.total_cost_inr,2*plan.hotel_summary.rooms_needed*plan.hotel_summary.price_per_night_per_room)

    def test_checkin_and_checkout_processes_do_not_overlap_terminal_buffers(self):
        stay = StayChoice(kind='booked',base_name='Fictional QA base',lat=17.38,lng=78.48,total_stay_cost_inr=1000,
                          check_in_date='2026-11-02',check_out_date='2026-11-03',check_in_time='14:00',check_out_time='14:00',
                          constrain_sightseeing_to_stay=True,check_in_buffer_minutes=30,check_out_buffer_minutes=30)
        req = self.request(end_date='2026-11-03',stay_choice=stay,journey_timing=self.journey(
            destination_arrival='2026-11-02T15:00+05:30',destination_departure='2026-11-03T16:00+05:30',
            arrival_transfer_minutes=60,arrival_buffer_minutes=30,departure_transfer_minutes=60))
        windows = planning_windows(req)
        self.assertEqual(windows[0]['start'],540) # 17:00 after transfer, rest and check-in.
        self.assertEqual(windows[1]['end'],300)   # 13:00, then checkout, transfer and boarding.

    def test_missing_nights_and_impossible_day_are_actionable_errors(self):
        stay = dict(kind='booked',base_name='QA',lat=17.38,lng=78.48,check_in_date='2026-11-03',check_out_date='2026-11-04')
        with self.assertRaisesRegex(ValueError,'do not cover'): self.request(stay_choice=stay)
        with self.assertRaisesRegex(ValueError,'no sightseeing time'): self.request(end_date='2026-11-02')

    def test_verifier_recomputes_bounds_and_rejects_removed_transfer_time(self):
        req = self.request()
        plan = _build_single_plan(req)
        altered = plan.model_copy(deep=True)
        altered.days[0].activities = [altered.days[1].activities[0].model_copy()]
        report = ItineraryVerifier.verify(altered,req,get_places_provider().get_places('hyderabad'))
        self.assertFalse(report.is_valid)
        self.assertTrue(any('availability' in e for e in report.errors))

    def test_authenticated_api_returns_verified_calendar_and_routing_contract(self):
        from fastapi.testclient import TestClient
        from tripweave.main import app
        from tripweave.auth import get_current_user, UserProfile
        def roads(points,mode):
            return {(a,b):(calculate_distance_km(*a,*b)*1.6,calculate_distance_km(*a,*b)*4) for a in points for b in points},'', '2026-10-25T00:00:00+00:00'
        user = UserProfile(id='d4000000-0000-4000-8000-000000000001',name='QA',email='routing@example.invalid',auth_provider='google',created_at='2026-10-25T00:00:00+00:00')
        old = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda:user
        try:
            with patch.object(routing.road_provider,'matrix',side_effect=roads):
                response = TestClient(app).post('/api/itinerary/generate-variants',json=self.request(use_road_routes=True).model_dump(mode='json'))
            self.assertEqual(response.status_code,200,response.text)
            saw_road = False
            for plan in response.json()['variants'].values():
                if not plan: continue
                self.assertTrue(plan['verification_report']['is_valid'])
                self.assertEqual(plan['planning_preferences']['availability_version'],2)
                # The free matrix covers at most 25 candidate points. A new
                # useful visit/stay can be outside it; never claim roads for
                # a returned route whose legs all use the labeled fallback.
                road_legs = plan['routing_summary']['road_legs']
                saw_road |= road_legs > 0
                self.assertEqual(plan['routing_summary']['source'],
                    'Geoapify / OpenStreetMap' if road_legs else 'distance_estimate')
                self.assertFalse(plan['days'][0]['activities']); self.assertFalse(plan['days'][2]['activities'])
            self.assertTrue(saw_road)
        finally:
            if old is None: app.dependency_overrides.pop(get_current_user,None)
            else: app.dependency_overrides[get_current_user]=old


if __name__ == '__main__': unittest.main()
