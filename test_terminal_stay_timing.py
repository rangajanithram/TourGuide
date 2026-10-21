"""Tests for stay timing, check-in/out coordination, and place rating enrichment."""
import unittest
from tripweave.models import (
    StayChoice, HotelStaySummary, Place, ScheduledActivity,
    TripPlan, TripRequest, DayPlan, PlanVariantType
)
from tripweave.verifier import ItineraryVerifier
from tripweave.feasibility import FeasibilityFilter


class TestStayTimingAndEnrichment(unittest.TestCase):
    def test_unknown_stay_facts_remain_unknown(self):
        stay = StayChoice(kind="booked", base_name="Test base", lat=17.4, lng=78.4)
        self.assertIsNone(stay.allows_bag_drop)
        request = TripRequest(destination="hyderabad", budget_inr=15000, days=2,
                              people_count=2, stay_choice=stay)
        _, summary = FeasibilityFilter().select_hotel([], request)
        self.assertIsNone(summary.check_in_time)
        self.assertIsNone(summary.check_out_time)
        with self.assertRaises(ValueError):
            StayChoice(kind="booked", base_name="Test base", lat=17.4, lng=78.4,
                       allows_bag_drop="yes")

    def test_stay_choice_valid_times(self):
        stay = StayChoice(
            version=1,
            kind="booked",
            base_name="Park Hyatt Hyderabad",
            lat=17.425,
            lng=78.435,
            total_stay_cost_inr=5000,
            budget_treatment="include",
            check_in_time="14:00",
            check_out_time="11:00",
            allows_bag_drop=True
        )
        self.assertEqual(stay.check_in_time, "14:00")
        self.assertEqual(stay.check_out_time, "11:00")
        self.assertTrue(stay.allows_bag_drop)

    def test_stay_choice_invalid_time_format(self):
        with self.assertRaises(ValueError):
            StayChoice(
                version=1,
                kind="booked",
                base_name="Test Hotel",
                lat=17.425,
                lng=78.435,
                check_in_time="25:00"
            )
        with self.assertRaises(ValueError):
            StayChoice(
                version=1,
                kind="booked",
                base_name="Test Hotel",
                lat=17.425,
                lng=78.435,
                check_out_time="invalid-time"
            )

    def test_hotel_stay_summary_carries_timing_and_ratings(self):
        summary = HotelStaySummary(
            hotel_id="test_hotel",
            hotel_name="Taj Falaknuma Palace",
            lat=17.331,
            lng=78.467,
            price_per_night_per_room=15000,
            rooms_needed=1,
            nights=2,
            people_accommodated=2,
            total_cost_inr=30000,
            provenance="Verified Test Data",
            check_in_time="14:00",
            check_out_time="12:00",
            rating=4.8,
            review_count=3450,
            formatted_address="Engine Bowli, Falaknuma, Hyderabad, Telangana 500053",
            osm_url="https://www.openstreetmap.org/?mlat=17.331&mlon=78.467#map=16/17.331/78.467"
        )
        self.assertEqual(summary.check_in_time, "14:00")
        self.assertEqual(summary.check_out_time, "12:00")
        self.assertEqual(summary.rating, 4.8)
        self.assertEqual(summary.review_count, 3450)
        self.assertIn("Falaknuma", summary.formatted_address)

    def test_place_and_scheduled_activity_ratings(self):
        place = Place(
            place_id="p_charminar",
            name="Charminar",
            place_type="attraction",
            lat=17.3615,
            lng=78.4746,
            duration_minutes=60,
            entry_fee_inr=25,
            rating=4.6,
            review_count=42500,
            formatted_address="Charminar Rd, Char Kaman, Ghansi Bazaar, Hyderabad",
            osm_url="https://www.openstreetmap.org/?mlat=17.3615&mlon=78.4746#map=17/17.3615/78.4746"
        )
        act = ScheduledActivity(
            place_id=place.place_id,
            place_name=place.name,
            place_type=place.place_type,
            lat=place.lat,
            lng=place.lng,
            start_time="09:00 AM",
            end_time="10:00 AM",
            estimated_cost_inr=25,
            rating=place.rating,
            review_count=place.review_count,
            formatted_address=place.formatted_address,
            osm_url=place.osm_url
        )
        self.assertEqual(act.rating, 4.6)
        self.assertEqual(act.review_count, 42500)
        self.assertIn("Char Kaman", act.formatted_address)
        self.assertIn("openstreetmap.org", act.osm_url)

    def test_verifier_catches_altered_stay_timing(self):
        stay = StayChoice(
            version=1,
            kind="booked",
            base_name="Custom Base",
            lat=17.385,
            lng=78.486,
            total_stay_cost_inr=2000,
            budget_treatment="include",
            check_in_time="15:00",
            check_out_time="11:00"
        )
        req = TripRequest(
            destination="hyderabad",
            budget_inr=15000,
            days=2,
            people_count=2,
            stay_choice=stay
        )
        filter_engine = FeasibilityFilter()
        base_place, hotel_summary = filter_engine.select_hotel([], req)
        self.assertEqual(hotel_summary.check_in_time, "15:00")
        self.assertEqual(hotel_summary.check_out_time, "11:00")

        # Now simulate altered check_in_time in the plan
        altered_summary = hotel_summary.model_copy(update={"check_in_time": "12:00"})
        plan = TripPlan(
            plan_name="Test Plan",
            variant_type=PlanVariantType.BALANCED,
            transport_mode="cab",
            hotel_summary=altered_summary,
            days=[
                DayPlan(day_number=1, date="2026-11-01", activities=[
                    ScheduledActivity(
                        place_id="p1", place_name="Test Attraction", place_type="attraction",
                        lat=17.385, lng=78.486, start_time="10:00 AM", end_time="11:00 AM",
                        estimated_cost_inr=0
                    )
                ], day_cost_inr=0),
                DayPlan(day_number=2, date="2026-11-02", activities=[
                    ScheduledActivity(
                        place_id="p2", place_name="Test Attraction 2", place_type="attraction",
                        lat=17.385, lng=78.486, start_time="10:00 AM", end_time="11:00 AM",
                        estimated_cost_inr=0
                    )
                ], day_cost_inr=0)
            ],
            total_cost_inr=2000
        )
        report = ItineraryVerifier.verify(plan, req, [base_place])
        self.assertFalse(report.is_valid)
        self.assertTrue(any("Accommodation conflict" in err for err in report.errors))


if __name__ == "__main__":
    unittest.main()
