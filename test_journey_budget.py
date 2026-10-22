import unittest
from tripweave.main import generate_itinerary, generate_variants
from tripweave.models import EditConsequenceRequest, EditActionType, RebalanceTiredRequest, TripPlan
from tripweave.editor import ItineraryEditor
from tripweave.verifier import ItineraryVerifier
from tripweave.provider import get_places_provider
from test_journey_timing import request, timing


class JourneyBudgetTests(unittest.TestCase):
    def req(self, **changes):
        values = dict(booked_transport=dict(outbound_mode="train", return_mode="flight",
                      total_fare_inr=6000, paid_inr=4000), whole_journey_budget_inr=10000)
        values.update(changes)
        return request(timing(), **values)

    def test_reserves_full_fare_not_only_unpaid_amount(self):
        req = self.req()
        self.assertEqual(req.destination_budget_available, 4000)
        plan = generate_itinerary(req)
        self.assertLessEqual(plan.total_cost_inr + 6000, 10000)
        self.assertTrue(plan.verification_report.is_valid)
        self.assertEqual(plan.planning_preferences.whole_journey_budget_inr, 10000)

    def test_prepaid_stay_reserved_once(self):
        req = self.req(stay_choice=dict(kind="booked", base_name="Test stay",
            lat=17.385, lng=78.4867, total_stay_cost_inr=2000, budget_treatment="already_paid"))
        self.assertEqual(req.destination_budget_available, 2000)
        included = self.req(stay_choice=dict(kind="booked", base_name="Test stay",
            lat=17.385, lng=78.4867, total_stay_cost_inr=2000, budget_treatment="include"))
        self.assertEqual(included.destination_budget_available, 4000)

    def test_transfer_costs_reserved_in_combined_cap(self):
        timed = timing()
        timed["arrival_transfer_cost_inr"] = 400
        timed["arrival_transfer_paid_inr"] = 200
        timed["departure_transfer_cost_inr"] = 600
        timed["departure_transfer_paid_inr"] = 0
        req = request(timed, booked_transport=dict(outbound_mode="train", return_mode="flight",
                      total_fare_inr=6000, paid_inr=4000), whole_journey_budget_inr=10000)
        # 10000 - 6000 tickets - 1000 transfers = 3000 available
        self.assertEqual(req.destination_budget_available, 3000)
        plan = generate_itinerary(req)
        self.assertLessEqual(plan.total_cost_inr + 6000 + 1000, 10000)
        self.assertTrue(plan.verification_report.is_valid)

    def test_changed_transfer_payment_rejected_without_cap(self):
        timed = timing()
        timed["arrival_transfer_cost_inr"] = 400
        timed["arrival_transfer_paid_inr"] = 200
        req = request(timed)
        plan = generate_itinerary(req)
        plan.planning_preferences.journey_timing = plan.planning_preferences.journey_timing.model_copy(update={"arrival_transfer_paid_inr": 0})
        report = ItineraryVerifier.verify(plan, req, get_places_provider().get_places("hyderabad"))
        self.assertFalse(report.is_valid)
        self.assertTrue(any("Transfer accounting conflict" in error for error in report.errors))

    def test_transfer_cost_paid_validation(self):
        timed = timing()
        timed["arrival_transfer_cost_inr"] = 400
        timed["arrival_transfer_paid_inr"] = 500  # exceeds cost
        with self.assertRaises(ValueError):
            request(timed)
        no_cost = timing()
        no_cost["arrival_transfer_paid_inr"] = 100  # paid without cost
        with self.assertRaises(ValueError):
            request(no_cost)

    def test_invalid_or_exhausted_cap(self):
        for cap in [True, 0, -1, 1.5, 6000, 5000001]:
            with self.subTest(cap=cap), self.assertRaises(ValueError):
                self.req(whole_journey_budget_inr=cap)
        with self.assertRaises(ValueError):
            self.req(booked_transport=None)

    def test_variants_and_serialized_plans_retain_cap(self):
        for plan in generate_variants(self.req()).variants.values():
            restored = TripPlan.model_validate_json(plan.model_dump_json())
            self.assertEqual(restored.planning_preferences.whole_journey_budget_inr, 10000)
            self.assertLessEqual(restored.total_cost_inr + 6000, 10000)
            self.assertTrue(restored.verification_report.is_valid)

    def test_rebalance_preserves_combined_cap(self):
        plan = generate_itinerary(self.req())
        result = ItineraryEditor.rebalance_tired_day(RebalanceTiredRequest(
            destination='hyderabad', plan=plan, day_number=1, current_time_str='11:00',
            current_activity_index=-1, people_count=2, budget_limit_inr=15000))
        self.assertTrue(result.is_feasible)
        self.assertEqual(result.updated_plan.planning_preferences.whole_journey_budget_inr, 10000)
        self.assertLessEqual(result.updated_plan.total_cost_inr + 6000, 10000)

    def test_pin_edit_and_reconstructed_request_retain_cap(self):
        req = self.req()
        plan = generate_itinerary(req)
        result = ItineraryEditor.preview_edit(EditConsequenceRequest(destination="hyderabad",
            plan=plan, day_number=1, activity_index=0, action=EditActionType.PIN,
            people_count=2, budget_limit_inr=15000))
        self.assertTrue(result.is_feasible, result.updated_plan.verification_report.errors)
        self.assertEqual(result.updated_plan.planning_preferences.whole_journey_budget_inr, 10000)
        plan.total_cost_inr = 5000
        report = ItineraryVerifier.verify(plan, req, get_places_provider().get_places("hyderabad"))
        self.assertFalse(report.is_valid)
        self.assertTrue(any("journey budget" in error for error in report.errors))


if __name__ == "__main__":
    unittest.main()
