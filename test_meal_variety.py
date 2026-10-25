"""Meal diversity must never bypass time, dietary, budget or pin constraints."""
import unittest
from datetime import date
from tripweave.models import Place, TripRequest
from tripweave.planning_candidates import meal_candidates


class MealVarietyTests(unittest.TestCase):
    def setUp(self):
        self.request = TripRequest(destination='hyderabad', days=3, people_count=2,
                                   budget_inr=15000, start_date=date(2026, 11, 2),
                                   meal_budget_per_person=200)
        self.base = Place(place_id='base', name='Base', lat=17.38, lng=78.48,
                          place_type='hotel', duration_minutes=0)

    def venue(self, identity, **changes):
        fields = dict(place_id=identity, name=identity, lat=17.38, lng=78.48,
                      place_type='restaurant', duration_minutes=30,
                      estimated_cost_per_person_inr=100, open_time_mins=60,
                      close_time_mins=720)
        fields.update(changes)
        return Place(**fields)

    def test_nine_meals_rotate_venues_without_same_day_repeats(self):
        meals = meal_candidates(self.request, [self.venue(str(i)) for i in range(4)], self.base)
        self.assertEqual(len(meals), 9)
        counts = [sum(m.meal_venue_id == str(i) for m in meals) for i in range(4)]
        self.assertLessEqual(max(counts) - min(counts), 1)
        for day in range(3):
            venues = [m.meal_venue_id for m in meals if m.planning_day == day]
            self.assertEqual(len(set(venues)), 3)
        self.assertEqual(meals, meal_candidates(self.request, [self.venue(str(i)) for i in range(4)], self.base))

    def test_single_venue_and_alias_keep_honest_unnamed_blocks(self):
        a = self.venue('one', name='One cafe')
        alias = self.venue('alias', name=' ONE CAFE ', lat=17.3801)
        meals = meal_candidates(self.request, [a, alias], self.base)
        self.assertEqual(sum(m.meal_venue_id is not None for m in meals), 3)
        self.assertEqual(len(meals), 9)
        self.assertTrue(all('No different suitable restaurant' in m.source_reference
                            for m in meals if m.meal_venue_id is None))

    def test_closed_and_unaffordable_venues_are_never_used(self):
        venues = [self.venue('closed', closed_days=['Monday', 'Tuesday', 'Wednesday']),
                  self.venue('expensive', estimated_cost_per_person_inr=300),
                  self.venue('unknown', open_time_mins=None, close_time_mins=None),
                  self.venue('late', open_time_mins=700, close_time_mins=720)]
        meals = meal_candidates(self.request, venues, self.base)
        self.assertTrue(all(m.meal_venue_id is None for m in meals))

    def test_pins_and_arrival_departure_are_preserved(self):
        request = self.request.model_copy(update={'days': 1, 'locked_activities': ['pinned'],
            'arrival_available_mins': 240, 'departure_deadline_mins': 420})
        meals = meal_candidates(request, [self.venue('pinned'), self.venue('lunch')], self.base)
        self.assertEqual([m.meal_type for m in meals], ['lunch'])
        self.assertEqual(meals[0].meal_venue_id, 'lunch')
        self.assertEqual(meals[0].open_time_mins, 240)
        self.assertEqual(meals[0].close_time_mins, 420)

    def test_own_meals_remain_opt_out(self):
        self.assertEqual(meal_candidates(self.request.model_copy(update={'food_preference': 'own_meals'}),
                                        [self.venue('one')], self.base), [])


if __name__ == '__main__':
    unittest.main()
