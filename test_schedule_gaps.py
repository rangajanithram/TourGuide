"""Useful nearby visits, one lunch per day, and hard constraints retained."""
import unittest
from unittest.mock import patch
from copy import deepcopy
from datetime import date
from ortools.constraint_solver import pywrapcp
from tripweave.main import _build_single_plan, generate_variants
from tripweave.models import Place, TripRequest, TripPlan
from tripweave.provider import get_places_provider
from tripweave.optimizer import TripOptimizer
from tripweave.planning_candidates import meal_candidates, reserve_pinned_meals
from tripweave.schedule_gaps import fill_schedule_gaps
from tripweave.verifier import ItineraryVerifier, _time_str_to_minutes


def place(key, start=60, end=720, duration=60, **values):
    data = dict(place_id=key, name=key, place_type='attraction', lat=17.4, lng=78.45, open_time_mins=start,
                close_time_mins=end, duration_minutes=duration, estimated_cost_per_person_inr=0)
    data.update(values)
    return Place(**data)


class GapPackingTests(unittest.TestCase):
    def model(self, limit=2, ticket=0, budget=100, closed=False, distance=1):
        # An explicit feasible route with breakfast then lunch. The optional
        # museum is nearby and fits between them; the other visit opens later.
        places = [place('base',duration=0,place_type='hotel'),
            place('breakfast',70,115,45,place_type='restaurant',meal_type='breakfast'),
            place('lunch',270,330,60,place_type='restaurant',meal_type='lunch'),
            place('afternoon',360,480,60),place('museum',120,240,60,estimated_cost_per_person_inr=ticket)]
        o = TripOptimizer(places,1,'base',start_date=date(2026,11,2))
        o.distance_matrix = [[0 if a==b else distance for b in range(5)] for a in range(5)]
        times = [[0 if a==b else places[a].duration_minutes+10 for b in range(5)] for a in range(5)]
        manager = pywrapcp.RoutingIndexManager(5,1,0)
        routing = pywrapcp.RoutingModel(manager)
        callback = routing.RegisterTransitCallback(lambda a,b: times[manager.IndexToNode(a)][manager.IndexToNode(b)])
        routing.SetArcCostEvaluatorOfAllVehicles(callback)
        routing.AddDimension(callback,720,720,False,'Time')
        dimension = routing.GetDimensionOrDie('Time')
        dimension.CumulVar(routing.Start(0)).SetValue(60)
        for i,p in enumerate(places[1:],1):
            dimension.CumulVar(manager.NodeToIndex(i)).SetRange(p.open_time_mins,p.close_time_mins-p.duration_minutes)
        routing.AddDisjunction([manager.NodeToIndex(4)],100)
        if closed:
            routing.solver().Add(routing.ActiveVar(manager.NodeToIndex(4))==0)
        count = routing.RegisterUnaryTransitCallback(lambda i: int(manager.IndexToNode(i) in (3,4)))
        routing.AddDimension(count,0,limit,True,'Count')
        cost = routing.RegisterTransitCallback(lambda a,b: places[manager.IndexToNode(b)].estimated_cost_per_person_inr)
        routing.AddDimension(cost,0,budget,True,'Budget')
        routing.CloseModel()
        assignment = routing.ReadAssignmentFromRoutes([[1,2,3]],True)
        self.assertIsNotNone(assignment)
        final = fill_schedule_gaps(o,manager,routing,assignment,times)
        ids=[]
        index=final.Value(routing.NextVar(routing.Start(0)))
        while not routing.IsEnd(index):
            ids.append(manager.IndexToNode(index))
            index=final.Value(routing.NextVar(index))
        starts = {node:final.Min(dimension.CumulVar(manager.NodeToIndex(node))) for node in ids}
        return ids, starts

    def test_nearby_museum_fills_the_morning_without_moving_meals(self):
        ids,starts=self.model()
        self.assertEqual(ids,[1,4,2,3])
        self.assertEqual(starts[4],125)
        self.assertGreaterEqual(starts[2],270)

    def test_gap_filling_respects_pace_budget_closure_and_locality(self):
        for changes in [dict(limit=1),dict(ticket=150),dict(closed=True),dict(distance=5)]:
            with self.subTest(changes=changes):
                self.assertEqual(self.model(**changes)[0],[1,2,3])

    def test_a_visit_after_lunch_can_move_into_a_morning_gap(self):
        # The production model still decides openings and the day deadline.
        venues=[place('base',duration=0,place_type='hotel'),
            place('breakfast',70,115,45,place_type='restaurant',meal_type='breakfast',planning_day=0),
            place('lunch',270,330,60,place_type='restaurant',meal_type='lunch',planning_day=0),
            place('nearby',120,600,60),place('late',360,480,60)]
        plan=TripOptimizer(venues,1,'base',locked_activities=['late'],max_total_budget=10000).generate_plan()
        acts=plan.days[0].activities
        self.assertLess(next(i for i,a in enumerate(acts) if a.place_id=='nearby'),
                        next(i for i,a in enumerate(acts) if a.place_id=='lunch'))
        self.assertIn('late',{a.place_id for a in acts})


class PinnedMealFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.request=TripRequest(destination='hyderabad',start_date='2026-11-02',days=3,people_count=2,
            budget_inr=30000,transport_mode='auto',locked_activities=['p_004','hyd_lumbini_park'],
            interests=['history','sunset','nature','food'],meal_budget_per_person=500)
        with patch('tripweave.weather.WeatherProvider.get_daily_forecasts',return_value={}):
            cls.plan=_build_single_plan(cls.request)

    def test_pinned_paradise_is_lunch_once_and_a_nearby_visit_fills_the_morning(self):
        plan=self.plan
        self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
        self.assertLessEqual(plan.total_cost_inr,30000)
        day=next(d for d in plan.days if any(a.place_id=='p_004' for a in d.activities))
        lunches=[a for a in day.activities if a.meal_type=='lunch']
        self.assertEqual(len(lunches),1)
        self.assertEqual(lunches[0].place_id,'p_004')
        self.assertTrue(lunches[0].is_locked)
        self.assertEqual(lunches[0].estimated_cost_inr,1600)
        breakfast=next(a for a in day.activities if a.meal_type=='breakfast')
        self.assertTrue(any(a.place_type=='attraction' and
            _time_str_to_minutes(a.start_time)>=_time_str_to_minutes(breakfast.end_time) and
            _time_str_to_minutes(a.end_time)<=_time_str_to_minutes(lunches[0].start_time) for a in day.activities))
        for day in plan.days:
            self.assertLessEqual(sum(a.place_type=='attraction' for a in day.activities),3)
            self.assertEqual(sorted(a.meal_type for a in day.activities if a.meal_type),['breakfast','dinner','lunch'])
            for prev,act in zip(day.activities,day.activities[1:]):
                gap=_time_str_to_minutes(act.start_time)-_time_str_to_minutes(prev.end_time)
                self.assertEqual(act.free_minutes_before+act.travel_minutes_from_previous,gap)

    def test_remaining_open_time_is_explained_and_snapshot_roundtrips(self):
        self.assertTrue(any('pace' in (d.planning_note or '') for d in self.plan.days))
        restored=TripPlan.model_validate_json(self.plan.model_dump_json())
        self.assertEqual(restored.days[0].activities[1].free_minutes_before,self.plan.days[0].activities[1].free_minutes_before)
        raw=self.plan.model_dump()
        for d in raw['days']:
            for a in d['activities']:
                a.pop('free_minutes_before',None)
                a.pop('travel_minutes_from_previous',None)
        self.assertIsNone(TripPlan.model_validate(raw).days[0].activities[1].free_minutes_before)

    def test_verifier_rejects_duplicate_lunch_even_when_both_are_in_the_meal_list(self):
        plan=deepcopy(self.plan)
        day=next(d for d in plan.days if any(a.place_id=='p_004' for a in d.activities))
        lunch=next(a for a in day.activities if a.meal_type=='lunch')
        day.activities.append(lunch.model_copy(deep=True))
        report=ItineraryVerifier.verify(plan,self.request,list(get_places_provider().get_places('hyderabad'))+plan.meal_places)
        self.assertFalse(report.is_valid)
        self.assertTrue(any('Duplicate lunch' in e for e in report.errors))

    def test_named_pin_and_food_disabled_stay_required_without_reserving_meals(self):
        req=self.request.model_copy(update={'locked_activities':['Paradise Biryani (Lunch Only)']})
        places=list(get_places_provider().get_places('hyderabad'))
        base=next(p for p in places if p.place_type=='hotel')
        meals=reserve_pinned_meals(req,places,base,meal_candidates(req,places,base))
        self.assertEqual(sum(m.place_id=='p_004' for m in meals),1)
        self.assertEqual(reserve_pinned_meals(req,places,base,[]),[])

    def test_required_meal_uses_its_own_hours_instead_of_the_replaced_venues_hours(self):
        req=TripRequest(destination='hyderabad',start_date='2026-11-02',days=1,people_count=1,budget_inr=10000,
                        locked_activities=['required'],meal_budget_per_person=500)
        base=place('base',duration=0,place_type='hotel')
        required=place('required',360,420,45,place_type='restaurant',tags=['lunch'])
        old=place('meal:0:lunch',240,300,45,place_type='restaurant',meal_type='lunch',planning_day=0)
        meals=reserve_pinned_meals(req,[required],base,[old])
        self.assertEqual(meals[0].place_id,'required')
        self.assertEqual((meals[0].open_time_mins,meals[0].close_time_mins),(360,420))

    def test_budget_balanced_comfort_all_keep_one_lunch_and_the_required_restaurant(self):
        with patch('tripweave.weather.WeatherProvider.get_daily_forecasts',return_value={}):
            result=generate_variants(self.request)
        self.assertEqual(set(result.variants),{'budget','balanced','comfort'})
        for key,plan in result.variants.items():
            with self.subTest(variant=key):
                self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
                self.assertEqual(sum(a.place_id=='p_004' for d in plan.days for a in d.activities),1)
                limit={'budget':2,'balanced':3,'comfort':4}[key]
                for day in plan.days:
                    self.assertLessEqual(sum(a.place_type=='attraction' for a in day.activities),limit)
                    self.assertEqual(sum(a.meal_type=='lunch' for a in day.activities),1)

    def test_transport_pace_and_short_day_combinations_keep_physical_time(self):
        cases=[('cab','relaxed','default',60,720),('auto','balanced','default',60,720),
               ('metro','intensive','default',60,720),('walk','relaxed','default',60,720),
               ('walk','balanced','elderly',60,720),('cab','balanced','default',300,360)]
        for mode,pace,group,arrival,departure in cases:
            with self.subTest(mode=mode,pace=pace,group=group,arrival=arrival):
                req=TripRequest(destination='hyderabad',start_date='2026-11-02',days=2,people_count=2,
                    budget_inr=30000,transport_mode=mode,pace=pace,group_profile=group,
                    arrival_available_mins=arrival,departure_deadline_mins=departure,meal_budget_per_person=200)
                with patch('tripweave.weather.WeatherProvider.get_daily_forecasts',return_value={}):
                    plan=_build_single_plan(req)
                self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
                self.assertLessEqual(plan.total_cost_inr,30000)
                cap={'relaxed':2,'balanced':3,'intensive':4}[pace]-(group=='elderly')
                for day in plan.days:
                    self.assertLessEqual(sum(a.place_type=='attraction' for a in day.activities),cap)
                    for prev,a in zip(day.activities,day.activities[1:]):
                        self.assertGreaterEqual(a.free_minutes_before,0)
                        self.assertEqual(a.travel_minutes_from_previous+a.free_minutes_before,
                            _time_str_to_minutes(a.start_time)-_time_str_to_minutes(prev.end_time))


if __name__=='__main__': unittest.main()
