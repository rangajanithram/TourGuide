"""A search limit must not turn a feasible trip into a false constraint error."""
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from ortools.constraint_solver import pywrapcp
from tripweave.main import _build_single_plan, generate_variants, search_incomplete_response
from tripweave.models import TripRequest, Place, PlanVariantType, HotelStaySummary
from tripweave.optimizer import TripOptimizer
from tripweave.planning_candidates import meal_candidates
from tripweave.verifier import ItineraryVerifier


class SearchRecoveryTests(unittest.TestCase):
    def request(self, **changes):
        values=dict(destination='hyderabad',origin_city='bengaluru',start_date='2026-11-02',days=3,
                    budget_inr=15000,people_count=2,transport_mode='cab',interests=['unesco','history','sunset'],meal_budget_per_person=200)
        values.update(changes)
        return TripRequest(**values)

    def test_reported_three_day_trip_returns_checked_variants(self):
        result=generate_variants(self.request())
        self.assertIn('balanced',result.variants)
        for plan in result.variants.values():
            self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
            self.assertLessEqual(plan.total_cost_inr,15000)
            self.assertEqual(len(plan.days),3)
            self.assertEqual(sum(a.place_type=='restaurant' for d in plan.days for a in d.activities),9)
            self.assertTrue(all(any(a.place_type=='attraction' for a in d.activities) for d in plan.days))

    def test_valid_seed_survives_improvement_timeout_with_pins_and_budget(self):
        req=self.request(locked_activities=['p_001','p_003'])
        with patch.object(pywrapcp.RoutingModel,'SolveFromAssignmentWithParameters',return_value=None) as improvement:
            plan=_build_single_plan(req)
        improvement.assert_called_once()
        self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
        self.assertLessEqual(plan.total_cost_inr,req.budget_inr)
        locked={a.place_id for d in plan.days for a in d.activities if a.is_locked}
        self.assertTrue(set(req.locked_activities).issubset(locked))

    def test_reported_trip_also_works_with_directional_road_estimates(self):
        from tripweave import routing
        from tripweave.distance import calculate_distance_km
        def matrix(points, mode):
            return {(a,b):(calculate_distance_km(*a,*b)*1.7,calculate_distance_km(*a,*b)*5)
                    for a in points for b in points},'', '2026-10-26T00:00:00+00:00'
        with patch.object(routing.road_provider,'matrix',side_effect=matrix), patch.object(pywrapcp.RoutingModel,'SolveFromAssignmentWithParameters',return_value=None):
            result=generate_variants(self.request(use_road_routes=True))
        self.assertTrue(result.variants)
        for plan in result.variants.values():
            self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
            self.assertLessEqual(plan.total_cost_inr,15000)
            self.assertTrue(plan.planning_preferences.use_road_routes)

    def test_incomplete_search_is_retryable_and_not_proven_infeasibility(self):
        for engine_status in [pywrapcp.RoutingModel.ROUTING_FAIL_TIMEOUT,pywrapcp.RoutingModel.ROUTING_FAIL]:
            with self.subTest(status=engine_status), patch('tripweave.initial_routes.initial_routes',return_value=None), patch.object(pywrapcp.RoutingModel,'SolveWithParameters',return_value=None), patch.object(pywrapcp.RoutingModel,'status',return_value=engine_status):
                with self.assertRaises(HTTPException) as caught: _build_single_plan(self.request())
                self.assertEqual(caught.exception.status_code,503)
                self.assertEqual(caught.exception.detail['code'],'planner_search_incomplete')
                self.assertTrue(caught.exception.detail['retryable'])

    def test_proven_infeasibility_keeps_constraint_error(self):
        with patch('tripweave.initial_routes.initial_routes',return_value=None), patch.object(pywrapcp.RoutingModel,'SolveWithParameters',return_value=None), patch.object(pywrapcp.RoutingModel,'status',return_value=pywrapcp.RoutingModel.ROUTING_INFEASIBLE):
            with self.assertRaises(HTTPException) as caught: _build_single_plan(self.request())
        self.assertEqual(caught.exception.status_code,422)
        self.assertIn('required stops',caught.exception.detail)

    def test_empty_seed_is_not_returned_or_reported_as_proven_infeasibility(self):
        with patch('tripweave.initial_routes.initial_routes',return_value=[[],[],[]]), patch.object(pywrapcp.RoutingModel,'SolveFromAssignmentWithParameters',return_value=None):
            with self.assertRaises(HTTPException) as caught: _build_single_plan(self.request(meal_budget_per_person=None))
        self.assertEqual(caught.exception.status_code,503)
        self.assertEqual(caught.exception.detail['code'],'planner_search_incomplete')

    def test_one_search_failure_does_not_discard_a_valid_variant(self):
        req=self.request()
        baseline=_build_single_plan(req)
        def build(request,variant=PlanVariantType.BALANCED,return_timings=False,**kwargs):
            if variant!=PlanVariantType.BALANCED: raise search_incomplete_response()
            return (baseline,{i:1 for i in range(1,9)}) if return_timings else baseline
        with patch('tripweave.main._build_single_plan',side_effect=build): result=generate_variants(req)
        self.assertEqual(set(result.variants),{'balanced'})
        self.assertTrue(result.variants['balanced'].verification_report.is_valid)
        self.assertIn('try again',result.unavailable_variants['budget'])
        with patch('tripweave.main._build_single_plan',side_effect=search_incomplete_response()):
            with self.assertRaises(HTTPException) as caught: generate_variants(req)
        self.assertEqual(caught.exception.status_code,503)

    def test_unreachable_dinner_uses_meal_block_instead_of_forcing_late_return(self):
        base=Place(place_id='base',name='Base',place_type='hotel',lat=17.38,lng=78.48,duration_minutes=0)
        far=Place(place_id='far',name='Distant dinner',place_type='restaurant',lat=17.55,lng=78.5,
                  duration_minutes=45,estimated_cost_per_person_inr=100,open_time_mins=630,close_time_mins=720)
        meals=meal_candidates(self.request(),[far],base)
        self.assertEqual(len(meals),9)
        self.assertTrue(all(m.meal_venue_id is None for m in meals if m.meal_type=='dinner'))

    def test_breakfast_accounts_for_outward_travel_before_its_window_closes(self):
        base=Place(place_id='base',name='Base',place_type='hotel',lat=17.38,lng=78.48,duration_minutes=0)
        far=Place(place_id='far',name='Distant breakfast',place_type='restaurant',lat=17.48,lng=78.48,
                  duration_minutes=45,estimated_cost_per_person_inr=100,open_time_mins=60,close_time_mins=180)
        meals=meal_candidates(self.request(transport_mode='walk'),[far],base)
        self.assertTrue(all(m.meal_venue_id is None for m in meals if m.meal_type=='breakfast'))

    def test_waiting_for_afternoon_opening_is_allowed_without_making_up_travel(self):
        req=self.request(days=1,meal_budget_per_person=None,locked_activities=['afternoon'])
        base=Place(place_id='base',name='Base',place_type='hotel',lat=17.38,lng=78.48,duration_minutes=0)
        stop=Place(place_id='afternoon',name='Afternoon venue',place_type='attraction',lat=base.lat,lng=base.lng,
                   duration_minutes=60,open_time_mins=420,close_time_mins=600)
        summary=HotelStaySummary(hotel_id='base',hotel_name='Base',lat=base.lat,lng=base.lng,
                    price_per_night_per_room=0,rooms_needed=0,nights=0,people_accommodated=2,total_cost_inr=0,provenance='Test base')
        plan=TripOptimizer([base,stop],days=1,hotel_id='base',hotel_summary=summary,people_count=2,start_date=req.start_date,
                          locked_activities=req.locked_activities,max_total_budget=15000).generate_plan()
        self.assertEqual(plan.days[0].activities[0].place_id,'afternoon')
        self.assertTrue(ItineraryVerifier.verify(plan,req,[base,stop]).is_valid)

    def test_meal_budget_conflict_identifies_the_setting_to_change(self):
        with self.assertRaises(HTTPException) as caught: _build_single_plan(self.request(days=1,budget_inr=1000))
        self.assertEqual(caught.exception.status_code,422)
        self.assertIn('Places & food',caught.exception.detail)
        self.assertIn('planned meals',caught.exception.detail)


if __name__=='__main__': unittest.main()
