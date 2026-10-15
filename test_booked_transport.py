import unittest
from tripweave.models import BookedTransport, TripPlan, TripRequest
from tripweave.main import generate_itinerary, generate_variants
from tripweave.verifier import ItineraryVerifier
from tripweave.provider import get_places_provider
from test_journey_timing import timing, request

class BookedTransportTests(unittest.TestCase):
    def booking(self, **changes):
        data = dict(outbound_mode='train', return_mode='flight', total_fare_inr=6000, paid_inr=4000)
        data.update(changes)
        return BookedTransport(**data)

    def test_invalid_fares_and_modes(self):
        for changes in [dict(paid_inr=6001), dict(total_fare_inr=-1), dict(total_fare_inr=True), dict(paid_inr=1.5), dict(return_mode='boat'), dict(version=2)]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.booking(**changes)

    def test_requires_valid_journey_timing(self):
        with self.assertRaises(ValueError):
            request(booked_transport=self.booking())
        with self.assertRaises(ValueError):
            request(timing(), origin_city='hyderabad', booked_transport=self.booking())

    def test_generated_variants_preserve_bookings_and_local_budget(self):
        req = request(timing(), booked_transport=self.booking(), intercity_modes=['bus'])
        result = generate_variants(req)
        for plan in result.variants.values():
            restored = TripPlan.model_validate_json(plan.model_dump_json())
            self.assertEqual(restored.booked_transport, req.booked_transport)
            self.assertEqual(restored.planning_preferences.booked_transport, req.booked_transport)
            self.assertIsNone(restored.intercity_transport)
            self.assertTrue(restored.verification_report.is_valid)
            self.assertLessEqual(restored.total_cost_inr, req.budget_inr)

    def test_fare_is_not_double_counted_and_verifier_rejects_tampering(self):
        req = request(timing(), booked_transport=self.booking())
        plan = generate_itinerary(req)
        baseline = generate_itinerary(request(timing()))
        self.assertEqual(plan.total_cost_inr, baseline.total_cost_inr)
        plan.booked_transport = self.booking(paid_inr=0)
        report = ItineraryVerifier.verify(plan, req, get_places_provider().get_places('hyderabad'))
        self.assertFalse(report.is_valid)
        self.assertTrue(any('Booked transport conflict' in error for error in report.errors))

    def test_pin_edit_preserves_booking_and_passes_independent_verifier(self):
        from tripweave.editor import ItineraryEditor
        from tripweave.models import EditConsequenceRequest, EditActionType
        req = request(timing(), booked_transport=self.booking())
        plan = generate_itinerary(req)
        result = ItineraryEditor.preview_edit(EditConsequenceRequest(
            destination='hyderabad', plan=plan, day_number=1, activity_index=0,
            action=EditActionType.PIN, people_count=2))
        self.assertTrue(result.is_feasible, result.updated_plan.verification_report.errors)
        self.assertEqual(result.updated_plan.booked_transport, req.booked_transport)
        self.assertEqual(result.updated_plan.planning_preferences.booked_transport, req.booked_transport)

    def test_editor_reconstructed_request_preserves_booking(self):
        req = request(timing(), booked_transport=self.booking())
        plan = generate_itinerary(req)
        reconstructed = TripRequest.model_construct(**{**req.model_dump(), **plan.planning_preferences.model_dump()})
        report = ItineraryVerifier.verify(plan, reconstructed, get_places_provider().get_places('hyderabad'))
        self.assertTrue(report.is_valid, report.errors)

if __name__ == '__main__':
    unittest.main()
