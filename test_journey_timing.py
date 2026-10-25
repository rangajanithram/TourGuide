import unittest
from tripweave.models import TripRequest, JourneyTiming, TripPlan
from tripweave.main import generate_itinerary
from tripweave.provider import get_places_provider
from tripweave.verifier import ItineraryVerifier


def timing(**changes):
    return dict(outbound_departure='2026-10-18T22:00+05:30',
                destination_arrival='2026-10-19T10:00+05:30',
                destination_departure='2026-10-19T19:00+05:30',
                return_arrival='2026-10-20T07:00+05:30',
                arrival_buffer_minutes=60, departure_buffer_minutes=90, **changes)


def request(journey=None, **changes):
    args = dict(destination='hyderabad', origin_city='bengaluru',
                start_date='2026-10-19', end_date='2026-10-19',
                budget_inr=15000, people_count=2)
    args.update(changes)
    return TripRequest(**args, journey_timing=journey)


class JourneyTimingTests(unittest.TestCase):
    def test_overnight_arrival_and_transfer_buffers(self):
        req = request(timing())
        self.assertEqual((req.arrival_available_mins, req.departure_deadline_mins), (180, 570))
        self.assertEqual(req.days, 1)  # travel nights do not become sightseeing days

    def test_legacy_requests_unchanged(self):
        req = request()
        self.assertEqual((req.arrival_available_mins, req.departure_deadline_mins), (60, 720))

    def test_invalid_times_and_offsets(self):
        for field, value in [('outbound_departure', '2026-10-19T11:00+05:30'),
                             ('destination_arrival', '2026-10-19T10:00'),
                             ('return_arrival', '2026-10-20T07:00Z')]:
            data = timing(); data[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                request(data)

    def test_no_available_time_and_wrong_dates(self):
        for changes in [dict(start_date='2026-10-18'), dict(end_date='2026-10-20'), dict(origin_city='hyderabad')]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                request(timing(), **changes)
        data = timing(); data['arrival_buffer_minutes'] = 600
        with self.assertRaises(ValueError):
            request(data)

    def test_buffer_crossing_midnight(self):
        data = timing(); data['destination_arrival'] = '2026-10-19T23:00+05:30'
        data['destination_departure'] = '2026-10-21T20:00+05:30'
        data['return_arrival'] = '2026-10-22T07:00+05:30'
        data['arrival_buffer_minutes'] = 120
        from tripweave.availability import planning_windows
        late = request(data, end_date='2026-10-21')
        self.assertEqual(planning_windows(late)[0]['end'], 0)
        self.assertEqual(planning_windows(late)[1]['start'], 60)
        req = request(data, start_date='2026-10-20', end_date='2026-10-21')
        self.assertEqual(req.arrival_available_mins, 60)

    def test_generated_saved_reopened_and_independently_verified(self):
        req = request(timing())
        plan = generate_itinerary(req)
        self.assertTrue(plan.verification_report.is_valid, plan.verification_report.errors)
        reopened = TripPlan.model_validate_json(plan.model_dump_json())
        self.assertEqual(reopened.planning_preferences.journey_timing, req.journey_timing)
        self.assertTrue(any('user-supplied' in warning for warning in plan.verification_report.warnings))
        # Editor reconstructs preferences using model_construct, including nested dictionaries.
        edited_request = TripRequest.model_construct(**reopened.planning_preferences.model_dump(),
            destination='hyderabad', days=1, budget_inr=15000, people_count=2)
        report = ItineraryVerifier.verify(reopened, edited_request, get_places_provider().get_places('hyderabad'))
        self.assertTrue(report.is_valid, report.errors)
        # Independent verifier must detect a newly impossible departure even if scalar bounds were stale.
        edited_request.journey_timing['destination_departure'] = '2026-10-19T11:45+05:30'
        self.assertFalse(ItineraryVerifier.verify(reopened, edited_request, get_places_provider().get_places('hyderabad')).is_valid)


if __name__ == '__main__':
    unittest.main()
