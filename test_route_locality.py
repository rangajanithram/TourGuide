"""Route quality and truthful explanations, alongside independent feasibility."""
import unittest
from unittest.mock import patch
from tripweave.clustering import GeoClusterer
from tripweave.distance import calculate_distance_km
from tripweave.exclusions import exclusion_hints
from tripweave.locality import day_neighborhoods
from tripweave.main import _build_single_plan
from tripweave.models import Place, TripRequest, TripPlan, DayPlan, ScheduledActivity
from tripweave.optimizer import TripOptimizer
from tripweave.planning_candidates import meal_candidates


class RouteLocalityTests(unittest.TestCase):
    def request(self, **changes):
        data = dict(destination='hyderabad', start_date='2026-11-02', days=3, people_count=2,
                    budget_inr=15000, transport_mode='cab', meal_budget_per_person=200, interests=['history', 'sunset'])
        data.update(changes)
        return TripRequest(**data)

    def place(self, key, lng=78.4, **changes):
        data = dict(place_id=key, name=key, lat=17.38, lng=lng, place_type='attraction',
                    duration_minutes=60, open_time_mins=60, close_time_mins=720, estimated_cost_per_person_inr=0)
        data.update(changes)
        return Place(**data)

    def test_connected_city_chain_is_split_into_bounded_areas(self):
        places = [self.place(str(i),78.35+i*.035) for i in range(7)]
        clusterer = GeoClusterer()
        broad = clusterer.cluster_places(places)
        self.assertEqual(len(broad),1)
        compact = clusterer.compact_clusters(broad)
        self.assertGreater(len(compact),1)
        self.assertEqual({p.place_id for group in compact.values() for p in group}, {p.place_id for p in places})
        for group in compact.values():
            self.assertLessEqual(max(calculate_distance_km(a.lat,a.lng,b.lat,b.lng) for a in group for b in group),5)
        self.assertEqual(compact, clusterer.compact_clusters(clusterer.cluster_places(list(reversed(places)))))

    def test_two_days_visit_separate_nearby_groups(self):
        base = self.place('base',place_type='hotel',duration_minutes=0)
        places = [self.place(f'{area}-{i}',78.4+area*.1+i*.002) for area in range(2) for i in range(3)]
        request = self.request(days=2,meal_budget_per_person=None)
        groups, preferences = day_neighborhoods(request,places,base)
        self.assertEqual(len(groups),2)
        plan = TripOptimizer(places+[base],days=2,hotel_id='base',start_date=request.start_date,
                             preferred_day_by_place=preferences,max_total_budget=15000).generate_plan()
        self.assertEqual(sum(len(d.activities) for d in plan.days),6)
        for day in plan.days:
            self.assertEqual(len({a.place_id.split('-')[0] for a in day.activities}),1)

    def test_lunch_is_near_the_days_sights_instead_of_global_rotation(self):
        base = self.place('base',place_type='hotel',duration_minutes=0)
        near = self.place('near',place_type='restaurant',tags=['lunch'],duration_minutes=45)
        far = self.place('far',78.53,place_type='restaurant',tags=['lunch'],duration_minutes=45)
        sights = {day:[self.place(f'sight-{day}',78.401)] for day in range(3)}
        meals = meal_candidates(self.request(),[near,far],base,sights)
        self.assertTrue(all(m.meal_venue_id=='near' for m in meals if m.meal_type=='lunch'))

    def test_missing_nearby_lunch_keeps_a_labeled_local_meal_block(self):
        base = self.place('base',place_type='hotel',duration_minutes=0)
        sight = self.place('sight',78.5)
        venue = self.place('far',78.4,place_type='restaurant',tags=['lunch'],duration_minutes=45)
        meals = meal_candidates(self.request(days=1),[venue],base,{0:[sight]})
        lunch = next(m for m in meals if m.meal_type=='lunch')
        self.assertIsNone(lunch.meal_venue_id)
        self.assertEqual((lunch.lat,lunch.lng),(sight.lat,sight.lng))
        self.assertIn('venue and walking time not confirmed',lunch.source_reference)

    def test_distant_pins_stay_required(self):
        base = self.place('base',place_type='hotel',duration_minutes=0)
        near, far = self.place('near'), self.place('far',78.56)
        plan = TripOptimizer([base,near,far],days=1,hotel_id='base',locked_activities=['near','far'],
                             max_total_budget=15000).generate_plan()
        self.assertEqual({a.place_id for a in plan.days[0].activities},{'near','far'})
        self.assertTrue(all(a.is_locked for a in plan.days[0].activities))

    def test_hyderabad_trip_reduces_cross_city_travel_without_empty_days(self):
        with patch('tripweave.weather.WeatherProvider.get_daily_forecasts',return_value={}):
            plan = _build_single_plan(self.request())
        self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
        self.assertLess(float(plan.verification_report.metrics['total_transit_km'].split()[0]),95)
        self.assertLessEqual(plan.total_cost_inr,15000)
        self.assertEqual(len(plan.meal_places),9)
        for day in plan.days:
            visits = [a for a in day.activities if a.place_type=='attraction']
            self.assertGreaterEqual(len(visits),2)
            self.assertLess(max(calculate_distance_km(a.lat,a.lng,b.lat,b.lng) for a in visits for b in visits),5.5)

    def test_meal_visits_do_not_falsely_fill_sightseeing_quota_or_list_used_venues(self):
        request = self.request(days=1)
        meal = ScheduledActivity(place_id='meal:0:lunch',place_name='Lunch - cafe',place_type='restaurant',
            lat=17.38,lng=78.4,start_time='12:00 PM',end_time='12:45 PM',estimated_cost_inr=0,
            meal_type='lunch',meal_venue_id='cafe')
        plan = TripPlan(plan_name='Test',transport_mode='cab',days=[DayPlan(day_number=1,cluster_name='Area',activities=[meal]*3,day_cost_inr=0)],total_cost_inr=0)
        hints = exclusion_hints(plan,request,[self.place('cafe',place_type='restaurant'),self.place('sight')])
        self.assertEqual(len(hints),1)
        self.assertEqual(hints[0].category,'route_choice')

    def test_partial_closure_is_not_reported_as_unavailable_for_the_whole_trip(self):
        request = self.request(days=2)
        plan = TripPlan(plan_name='Test',transport_mode='cab',days=[DayPlan(day_number=1,cluster_name='Area',activities=[],day_cost_inr=0)],total_cost_inr=0)
        hints = exclusion_hints(plan,request,[self.place('museum',closed_days=['Monday'])])
        self.assertNotEqual(hints[0].category,'closed_on_day')
        hints = exclusion_hints(plan,request,[self.place('museum',closed_days=['Monday','Tuesday'])])
        self.assertEqual(hints[0].category,'closed_on_day')


if __name__=='__main__': unittest.main()
