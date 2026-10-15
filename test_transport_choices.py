import unittest
from datetime import date
from pydantic import ValidationError
from tripweave.models import PlanningPreferences
from tripweave.transport import InterCityTransportProvider

class TransportChoicesTests(unittest.TestCase):
    def setUp(self):
        self.provider = InterCityTransportProvider()
        self.routes = self.provider.get_routes('bengaluru', 'hyderabad')
        self.assertTrue(self.routes)

    def summary(self, **kwargs):
        return self.provider.get_transport_summary('bengaluru', 'hyderabad', 'Base', 0, 0, **kwargs)

    def test_each_mode_filters_both_legs_and_variants(self):
        for mode in ['train', 'bus', 'flight']:
            for variant in ['budget', 'balanced', 'comfort']:
                summary = self.summary(allowed_modes=[mode], variant_type=variant)
                self.assertIsNotNone(summary)
                self.assertEqual(summary.recommended_option.mode, mode)
                self.assertTrue(all(r.mode == mode for r in summary.all_options + summary.all_return_options))
                if summary.return_option:
                    self.assertEqual(summary.return_option.mode, mode)

    def test_known_nonoperating_outbound_never_recommended(self):
        self.provider._routes = [r.model_copy(update={'operating_days': [0]}) for r in self.routes]
        self.assertIsNone(self.summary(start_date=date(2026, 10, 20)))

    def test_missing_return_not_invented(self):
        self.provider._routes = self.routes
        summary = self.summary()
        self.assertIsNone(summary.return_option)
        self.assertIsNone(summary.return_last_mile)
        self.assertIn('unknown', summary.transit_advice)

    def test_known_nonoperating_return_excluded(self):
        self.provider._routes = [r.model_copy(update={'operating_days': [0]}) if r.origin_city == 'hyderabad' else r for r in self.provider._routes]
        summary = self.summary(end_date=date(2026, 10, 20))
        self.assertIsNone(summary.return_option)
        self.assertEqual(summary.all_return_options, [])

    def test_verified_weekday_return_does_not_raise(self):
        self.provider._routes = [r.model_copy(update={'operating_days': [0]}) for r in self.provider._routes]
        summary = self.summary(start_date=date(2026, 10, 19), end_date=date(2026, 10, 19))
        self.assertIsNotNone(summary.return_option)

    def test_generated_plan_and_snapshot_keep_modes(self):
        from tripweave.models import TripRequest, TripPlan
        from tripweave.main import generate_itinerary
        req = TripRequest(destination='hyderabad', origin_city='bengaluru', days=2,
                          start_date='2026-10-20', budget_inr=15000, people_count=2,
                          intercity_modes=['bus'])
        plan = generate_itinerary(req)
        restored = TripPlan.model_validate_json(plan.model_dump_json())
        self.assertTrue(restored.verification_report.is_valid)
        self.assertEqual(restored.planning_preferences.intercity_modes, ['bus'])
        self.assertEqual(restored.intercity_transport.recommended_option.mode, 'bus')

    def test_validation_and_legacy_default(self):
        self.assertEqual(PlanningPreferences().intercity_modes, ['train', 'bus', 'flight'])
        for value in [[], ['boat'], ['train'] * 4]:
            with self.assertRaises(ValidationError):
                PlanningPreferences(intercity_modes=value)
        self.assertEqual(PlanningPreferences(intercity_modes=['bus']).model_dump()['intercity_modes'], ['bus'])

if __name__ == '__main__':
    unittest.main()
