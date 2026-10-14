import unittest
from tripweave.models import TripRequest, StayChoice, TripPlan
from tripweave.feasibility import FeasibilityFilter
from tripweave.main import generate_itinerary, generate_variants
from tripweave.provider import get_places_provider
from tripweave.verifier import ItineraryVerifier


def choice(**changes):
    data = dict(kind='booked', base_name='My confirmed base', lat=17.385, lng=78.486,
                total_stay_cost_inr=3000, budget_treatment='include')
    data.update(changes)
    return StayChoice(**data)


def request(stay=None, **changes):
    data = dict(destination='hyderabad', days=2, start_date='2026-10-20',
                budget_inr=15000, people_count=2, stay_choice=stay)
    data.update(changes)
    return TripRequest(**data)


class StayChoiceTests(unittest.TestCase):
    def test_booked_and_prepaid_costs_and_depot(self):
        for treatment, included, excluded in [('include', 3000, 0), ('already_paid', 0, 3000)]:
            with self.subTest(treatment=treatment):
                base, summary = FeasibilityFilter().select_hotel([], request(choice(budget_treatment=treatment)))
                self.assertEqual((base.lat, base.lng), (17.385, 78.486))
                self.assertEqual((summary.total_cost_inr, summary.excluded_prepaid_cost_inr), (included, excluded))
                self.assertEqual(summary.reported_stay_total_inr, 3000)

    def test_family_and_no_stay_do_not_require_catalog_hotels(self):
        for kind, nights in [('family_friends', 1), ('no_stay', 0)]:
            _, summary = FeasibilityFilter().select_hotel([], request(choice(kind=kind, total_stay_cost_inr=0)))
            self.assertEqual(summary.nights, nights)
            self.assertEqual(summary.total_cost_inr, 0)
            self.assertEqual(summary.accommodation_kind, kind)

    def test_invalid_scope_and_location(self):
        for changes in [dict(kind='family_friends'), dict(base_name=' '), dict(lat=91), dict(total_stay_cost_inr=-1), dict(kind='no_stay', total_stay_cost_inr=0, budget_treatment='already_paid')]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                choice(**changes)
        for stay in [choice(lat=28.6, lng=77.2), choice(total_stay_cost_inr=15000)]:
            with self.assertRaises(ValueError):
                FeasibilityFilter().select_hotel([], request(stay))

    def test_generation_reopen_and_edit_verifier_preserve_scope(self):
        req = request(choice(budget_treatment='already_paid'))
        plan = generate_itinerary(req)
        self.assertTrue(plan.verification_report.is_valid, plan.verification_report.errors)
        reopened = TripPlan.model_validate_json(plan.model_dump_json())
        self.assertEqual(reopened.planning_preferences.stay_choice, req.stay_choice)
        self.assertEqual(reopened.hotel_summary.excluded_prepaid_cost_inr, 3000)
        self.assertNotIn('centroid', reopened.hotel_summary.why_this_hotel)
        editor_request = TripRequest.model_construct(**reopened.planning_preferences.model_dump(),
            destination='hyderabad', days=2, budget_inr=15000, people_count=2)
        places = get_places_provider().get_places('hyderabad')
        self.assertTrue(ItineraryVerifier.verify(reopened, editor_request, places).is_valid)
        reopened.hotel_summary.excluded_prepaid_cost_inr = 0
        report = ItineraryVerifier.verify(reopened, editor_request, places)
        self.assertFalse(report.is_valid)
        self.assertTrue(any('Accommodation conflict' in error for error in report.errors))

    def test_no_stay_multi_day_warning(self):
        plan = generate_itinerary(request(choice(kind='no_stay', total_stay_cost_inr=0)))
        self.assertTrue(plan.verification_report.is_valid, plan.verification_report.errors)
        self.assertTrue(any('No overnight accommodation' in text for text in plan.verification_report.warnings))
        self.assertEqual(plan.hotel_summary.total_cost_inr, 0)

    def test_variants_keep_confirmed_base_and_cost(self):
        result = generate_variants(request(choice()))
        plans = list(result.variants.values())
        self.assertGreaterEqual(len(plans), 1)
        for plan in plans:
            self.assertEqual(plan.hotel_summary.hotel_id, 'user_stay_base')
            self.assertEqual(plan.hotel_summary.total_cost_inr, 3000)
            self.assertEqual(plan.hotel_summary.lat, 17.385)
            self.assertTrue(plan.verification_report.is_valid)

    def test_legacy_selection_unchanged(self):
        _, summary = FeasibilityFilter().select_hotel(get_places_provider().get_places('hyderabad'), request())
        self.assertEqual(summary.accommodation_kind, 'planner_selected')
        self.assertGreater(summary.total_cost_inr, 0)


if __name__ == '__main__':
    unittest.main()
