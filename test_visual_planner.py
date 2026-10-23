"""Contracts behind visual browsing: optional choices, source facts and meal identity."""
import unittest
from unittest.mock import patch
from pydantic import ValidationError
from tripweave.main import planner_catalog, generate_itinerary
from tripweave.models import Place, TripRequest


class VisualPlannerTests(unittest.TestCase):
    def test_old_requests_have_no_optional_choices(self):
        request = TripRequest(destination='hyderabad', days=1, people_count=1, budget_inr=5000)
        self.assertEqual(request.preferred_activities, [])

    def test_optional_choices_are_bounded(self):
        with self.assertRaises(ValidationError):
            TripRequest(destination='hyderabad', days=1, people_count=1, budget_inr=5000,
                        preferred_activities=[str(index) for index in range(16)])

    def test_catalog_preserves_missing_facts_and_source(self):
        place = Place(place_id='sample', name='Sample park', place_type='attraction',
                      lat=17.38, lng=78.48, duration_minutes=60,
                      source_reference='Independent test fixture', last_verified_date=None)
        with patch('tripweave.main.get_database_places', return_value=[place]):
            result = planner_catalog('hyderabad')['places'][0]
        self.assertIsNone(result['rating'])
        self.assertIsNone(result['open_time_mins'])
        self.assertIsNone(result['last_verified_date'])
        self.assertEqual(result['source_reference'], 'Independent test fixture')
        self.assertEqual(result['cost'], 0)

    def test_optional_choice_is_not_promoted_to_required(self):
        request = TripRequest(destination='hyderabad', start_date='2026-11-02', days=1,
                              people_count=1, budget_inr=5000,
                              preferred_activities=['not-in-this-catalog'],
                              meal_budget_per_person=200)
        plan = generate_itinerary(request)
        self.assertTrue(plan.verification_report.is_valid)
        self.assertFalse(any(activity.is_locked for day in plan.days for activity in day.activities))
        self.assertEqual(plan.planning_preferences.preferred_activities, request.preferred_activities)
        for day in plan.days:
            for activity in day.activities:
                if activity.meal_type and 'arrange venue' in activity.place_name:
                    self.assertIsNone(activity.meal_venue_id)


if __name__ == '__main__':
    unittest.main()
