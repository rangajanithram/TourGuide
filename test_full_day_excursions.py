"""Reproduce the four-day, five-pin request without weakening its constraints."""
import unittest
from copy import deepcopy
from unittest.mock import patch
from fastapi import HTTPException
from tripweave.main import generate_variants, _build_single_plan
from tripweave.models import TripRequest, TripPlan, MultiVariantTripPlan, EditConsequenceRequest, StayChoice
from tripweave.provider import get_places_provider
from tripweave.verifier import ItineraryVerifier, _time_str_to_minutes
from tripweave.availability import planning_windows
from tripweave.editor import ItineraryEditor


class FullDayExcursionTests(unittest.TestCase):
    @staticmethod
    def request(**changes):
        values = dict(destination='hyderabad',origin_city='bengaluru',start_date='2026-11-02',days=4,
            people_count=2,budget_inr=30000,transport_mode='auto',pace='balanced',group_profile='young_solo',
            locked_activities=['p_001','p_002','p_003','hyd_hussain_sagar','hyd_ramoji'],
            interests=['unesco','history','sunset','nature','food'],food_preference='any',
            meal_budget_per_person=500,intercity_modes=['train','bus'])
        values.update(changes)
        return TripRequest(**values)

    @classmethod
    def setUpClass(cls):
        cls.req = cls.request()
        with patch('tripweave.weather.WeatherProvider.get_daily_forecasts',return_value={}):
            cls.result = generate_variants(cls.req)
        cls.plan = cls.result.variants['balanced']

    def verify(self, plan):
        return ItineraryVerifier.verify(plan,self.req,
            list(get_places_provider().get_places('hyderabad')) + plan.meal_places + plan.visit_continuations)

    def test_reported_settings_keep_every_pin_and_meal_within_budget(self):
        self.assertTrue(self.result.variants)
        for plan in self.result.variants.values():
            self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
            self.assertLessEqual(plan.total_cost_inr,30000)
            self.assertEqual(len(plan.days),4)
            self.assertEqual(len(plan.meal_places),12)
            ids = {a.place_id for d in plan.days for a in d.activities}
            self.assertTrue(set(self.req.locked_activities).issubset(ids))
            for day in plan.days:
                for a,b in zip(day.activities,day.activities[1:]):
                    self.assertLessEqual(_time_str_to_minutes(a.end_time),_time_str_to_minutes(b.start_time))

    def test_full_day_length_and_lunch_are_preserved_without_double_ticket(self):
        day = next(d for d in self.plan.days if any(a.visit_part for a in d.activities))
        parts = [a for a in day.activities if a.visit_parent_id=='hyd_ramoji']
        self.assertEqual([a.visit_part for a in parts],['before_lunch',None,'after_lunch'])
        self.assertEqual(sum(_time_str_to_minutes(a.end_time)-_time_str_to_minutes(a.start_time) for a in parts),360)
        self.assertEqual(parts[1].meal_type,'lunch')
        self.assertEqual(parts[0].estimated_cost_inr,3100)
        self.assertEqual(parts[2].estimated_cost_inr,0)
        self.assertTrue(parts[0].is_locked and parts[2].is_locked)
        self.assertIn('08:00',day.planning_note)
        self.assertIn('includes a 30-minute lunch',day.planning_note)

    def test_verifier_rejects_shortened_visit_even_if_timing_still_looks_possible(self):
        plan = deepcopy(self.plan)
        root = next(a for d in plan.days for a in d.activities if a.visit_part=='before_lunch')
        minute = _time_str_to_minutes(root.end_time)-1
        root.end_time = ItineraryVerifier._minutes_to_clock_time(minute)
        report = self.verify(plan)
        self.assertFalse(report.is_valid)
        self.assertTrue(any('Full-day visit' in error for error in report.errors))

    def test_verifier_rejects_missing_lunch_even_if_removed_from_reserved_list(self):
        plan = deepcopy(self.plan)
        day = next(d for d in plan.days if any(a.visit_part for a in d.activities))
        lunch = next(a for a in day.activities if a.visit_parent_id and a.meal_type)
        day.activities.remove(lunch)
        day.day_cost_inr -= lunch.estimated_cost_inr
        plan.total_cost_inr -= lunch.estimated_cost_inr
        plan.meal_places = [p for p in plan.meal_places if p.place_id != lunch.place_id]
        self.assertFalse(self.verify(plan).is_valid)

    def test_stripping_markers_cannot_turn_a_short_segment_into_the_whole_visit(self):
        plan = deepcopy(self.plan)
        plan.visit_continuations = []
        for day in plan.days:
            day.activities = [a for a in day.activities if a.visit_part != 'after_lunch']
            for a in day.activities:
                a.visit_parent_id = None
                a.visit_part = None
        report = self.verify(plan)
        self.assertFalse(report.is_valid)
        self.assertTrue(any('Visit length mismatch' in error for error in report.errors))

    def test_saved_snapshot_round_trip_keeps_linked_parts_and_passes_again(self):
        restored = MultiVariantTripPlan.model_validate_json(self.result.model_dump_json())
        plan = restored.variants['balanced']
        self.assertEqual(len(plan.visit_continuations),1)
        self.assertTrue(self.verify(plan).is_valid)
        legacy = TripPlan.model_validate({k:v for k,v in self.plan.model_dump().items() if k!='visit_continuations'})
        self.assertEqual(legacy.visit_continuations,[])

    def test_linked_day_edit_is_blocked_with_regeneration_guidance(self):
        day = next(d for d in self.plan.days if any(a.visit_part for a in d.activities))
        request = EditConsequenceRequest(plan=self.plan,day_number=day.day_number,activity_index=1,
            action='remove',destination='hyderabad',people_count=2,budget_limit_inr=30000)
        with self.assertRaisesRegex(ValueError,'linked'):
            ItineraryEditor._preview_edit(request)

    def test_early_start_never_overrides_first_day_arrival_or_late_stay_access(self):
        request = self.request(arrival_available_mins=180)
        windows = planning_windows(request,early_start_days=range(4))
        self.assertEqual(windows[0]['start'],180)
        self.assertEqual(windows[1]['start'],0)
        stay = StayChoice(kind='booked',base_name='Confirmed base',lat=17.38,lng=78.4,
            check_in_date='2026-11-03',check_out_date='2026-11-06',check_in_time='10:00',
            check_out_time='18:00',constrain_sightseeing_to_stay=True)
        journey = dict(version=1,timezone='Asia/Kolkata',outbound_departure='2026-11-02T22:00:00+05:30',
            destination_arrival='2026-11-03T07:00:00+05:30',destination_departure='2026-11-05T22:00:00+05:30',
            return_arrival='2026-11-06T08:00:00+05:30',arrival_buffer_minutes=0,departure_buffer_minutes=0)
        bounded = planning_windows(self.request(start_date='2026-11-03',days=3,stay_choice=stay,journey_timing=journey),early_start_days=range(3))
        self.assertEqual(bounded[0]['start'],120)
        with patch('tripweave.weather.WeatherProvider.get_daily_forecasts',return_value={}):
            with self.assertRaises(HTTPException) as caught:
                _build_single_plan(self.request(days=1))
        self.assertEqual(caught.exception.status_code,422)
        self.assertIn('must-visits',str(caught.exception.detail))

    def test_directional_roads_are_used_and_closer_stay_can_replace_unusable_one(self):
        from tripweave.distance import calculate_distance_km
        from tripweave import routing
        def matrix(points,mode):
            return {(a,b):(calculate_distance_km(*a,*b)*1.4, calculate_distance_km(*a,*b)*3)
                    for a in points for b in points},'', '2026-10-26T00:00:00+00:00'
        with patch.object(routing.road_provider,'matrix',side_effect=matrix), patch('tripweave.weather.WeatherProvider.get_daily_forecasts',return_value={}):
            plan = _build_single_plan(self.request(use_road_routes=True))
        self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
        self.assertLessEqual(plan.total_cost_inr,30000)
        self.assertNotEqual(plan.hotel_summary.hotel_id,'h_002')
        self.assertGreater(plan.routing_summary['road_legs'],0)


if __name__=='__main__': unittest.main()
