"""Planner catalog and evidence-based preference regression checks."""
import unittest
from fastapi import HTTPException
from tripweave.main import planner_catalog, _build_single_plan
from tripweave.models import TripRequest, Place, TripPlan
from tripweave.preferences import preference_conflict
from tripweave.verifier import ItineraryVerifier
from tripweave.provider import get_places_provider
from tripweave.weather import WeatherProvider
from unittest.mock import patch

class PlannerPreferenceTests(unittest.TestCase):
    def request(self, **extra):
        return TripRequest(destination='hyderabad', days=2, budget_inr=15000, people_count=2, **extra)

    def place(self, **extra):
        return Place(place_id='test', name='Test venue', place_type='attraction', lat=17, lng=78, duration_minutes=120, **extra)

    def test_catalog_is_destination_specific(self):
        hyd, jaipur = planner_catalog('hyderabad'), planner_catalog('jaipur')
        self.assertNotEqual(hyd['places'], jaipur['places'])
        self.assertTrue(any(p['label'] == 'Charminar' for p in hyd['places']))
        self.assertNotIn('Charminar', [p['label'] for p in jaipur['places']])
        self.assertFalse(hyd['climbing_known'])

    def test_unknown_climbing_is_not_accessible(self):
        self.assertIsNotNone(preference_conflict(self.place(), self.request(avoid_climbing=True)))
        self.assertIsNone(preference_conflict(self.place(requires_climbing=False), self.request(avoid_climbing=True)))

    def test_duration_limit_is_enforced(self):
        self.assertIsNotNone(preference_conflict(self.place(), self.request(max_visit_minutes=90)))
        self.assertIsNone(preference_conflict(self.place(), self.request(max_visit_minutes=120)))

    def test_diet_requires_explicit_evidence(self):
        restaurant = self.place().model_copy(update={'place_type': 'restaurant'})
        self.assertIsNotNone(preference_conflict(restaurant, self.request(food_preference='vegetarian')))
        restaurant.dietary_options = ['vegetarian']
        self.assertIsNone(preference_conflict(restaurant, self.request(food_preference='vegetarian')))
        self.assertIsNotNone(preference_conflict(restaurant, self.request(food_preference='own_meals')))

    def test_generated_preferences_survive_serialization_and_verification(self):
        request = self.request(max_visit_minutes=90, food_preference='own_meals')
        with patch.object(WeatherProvider, 'get_daily_forecasts', return_value={}):
            plan = _build_single_plan(request, prefetched_weather={})
        restored = TripPlan.model_validate_json(plan.model_dump_json())
        self.assertEqual(restored.planning_preferences.food_preference, 'own_meals')
        self.assertTrue(all(a.place_type != 'restaurant' for d in plan.days for a in d.activities))
        catalog = get_places_provider().get_places('hyderabad')
        self.assertTrue(ItineraryVerifier.verify(plan, request, catalog).is_valid)
        stricter = request.model_copy(update={'max_visit_minutes': 30})
        self.assertFalse(ItineraryVerifier.verify(plan, stricter, catalog).is_valid)

    def test_pin_conflict_is_explicit(self):
        with self.assertRaises(HTTPException) as caught:
            _build_single_plan(self.request(locked_activities=['Salar Jung Museum'], max_visit_minutes=30))
        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn('Must-visit conflict', str(caught.exception.detail))

if __name__ == '__main__':
    unittest.main()


