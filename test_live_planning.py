import unittest
from tripweave.models import TripRequest, ConfirmedDiscoveryStop
from tripweave.main import generate_itinerary
from tripweave.verifier import ItineraryVerifier
from tripweave.provider import get_places_provider, merge_confirmed_stops

class LivePlanningTests(unittest.TestCase):
 def test_confirmed_pin_and_date_windows(self):
  stop=ConfirmedDiscoveryStop(place_id='test',name='User confirmed visit',lat=17.385,lng=78.486,duration_minutes=30,estimated_cost_per_person_inr=100,open_time_mins=360,close_time_mins=600)
  req=TripRequest(destination='hyderabad',days=1,budget_inr=15000,people_count=2,external_stops=[stop],locked_activities=['discovered:test'],arrival_available_mins=360,departure_deadline_mins=600)
  plan=generate_itinerary(req)
  self.assertTrue(plan.verification_report.is_valid)
  self.assertTrue(any(a.place_id=='discovered:test' for d in plan.days for a in d.activities))
  self.assertEqual(plan.planning_preferences.external_stops,[stop])
  from tripweave.models import TripPlan
  reopened = TripPlan.model_validate_json(plan.model_dump_json())
  self.assertEqual(reopened.planning_preferences.external_stops,[stop])
  self.assertTrue(ItineraryVerifier.verify(reopened,req,merge_confirmed_stops(get_places_provider().get_places('hyderabad'),[stop])).is_valid)
  self.assertTrue(any('user-confirmed' in w for w in plan.verification_report.warnings))
 def test_meals_respect_departure(self):
  req=TripRequest(destination='hyderabad',days=2,budget_inr=15000,people_count=2,meal_budget_per_person=100,departure_deadline_mins=600)
  plan=generate_itinerary(req)
  self.assertTrue(plan.verification_report.is_valid)
  self.assertEqual({p.meal_type for p in plan.meal_places if p.planning_day==1},{'breakfast','lunch'})
  self.assertEqual(len(plan.meal_places),5)
  self.assertTrue(all(p.place_id in {a.place_id for d in plan.days for a in d.activities} for p in plan.meal_places))
 def test_bad_confirmation_window(self):
  with self.assertRaises(ValueError):
   ConfirmedDiscoveryStop(place_id='x',name='x',lat=17,lng=78,duration_minutes=120,estimated_cost_per_person_inr=0,open_time_mins=600,close_time_mins=650)
if __name__=='__main__':unittest.main()
