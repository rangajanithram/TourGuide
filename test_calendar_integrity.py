"""Sparse itineraries must retain the complete requested calendar for cloud saving."""
import unittest
from datetime import date, timedelta
from tripweave.provider import get_places_provider
from tripweave.models import TripRequest
from tripweave.feasibility import FeasibilityFilter
from tripweave.optimizer import TripOptimizer
from tripweave.verifier import ItineraryVerifier


class CalendarTests(unittest.TestCase):
    def test_single_visit_retains_all_three_dates_and_zero_cost_free_days(self):
        places = get_places_provider().get_places('hyderabad')
        hotel = next(p for p in places if p.place_type == 'hotel')
        visit = next(p for p in places if p.name == 'Charminar')
        request = TripRequest(destination='hyderabad', start_date='2026-10-15', days=3,
                              budget_inr=50000, people_count=2)
        _, summary = FeasibilityFilter().select_hotel([hotel, visit], request)
        plan = TripOptimizer(places=[hotel, visit], days=3, hotel_id=hotel.place_id,
                             hotel_summary=summary, people_count=2,
                             start_date=request.start_date, max_total_budget=50000).generate_plan()
        self.assertEqual([d.day_number for d in plan.days], [1, 2, 3])
        self.assertEqual([d.date for d in plan.days], [(date(2026,10,15)+timedelta(days=i)).isoformat() for i in range(3)])
        self.assertEqual(sum(bool(d.activities) for d in plan.days), 1)
        self.assertTrue(all(d.day_cost_inr == 0 for d in plan.days if not d.activities))
        self.assertTrue(ItineraryVerifier.verify(plan, request, [hotel, visit]).is_valid)


if __name__ == '__main__':
    unittest.main()
