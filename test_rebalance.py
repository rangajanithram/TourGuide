from unittest import TestCase, main
from unittest.mock import Mock, patch

from pydantic import ValidationError

from tripweave.editor import ItineraryEditor, _add_minutes, _estimated_leg, _parse_time_str
from tripweave.distance import get_travel_metrics
from tripweave.models import (
    DayPlan,
    ExpenseBreakdown,
    GroupProfile,
    HotelStaySummary,
    PacePreference,
    Place,
    RebalanceTiredRequest,
    ScheduledActivity,
    TirednessSeverity,
    TransportMode,
    TripPlan,
)


class LiveRebalanceTests(TestCase):
    def setUp(self):
        self.places = [
            Place(place_id="test-a", name="Test A", place_type="attraction", lat=17.3616, lng=78.4747,
                  duration_minutes=120, estimated_cost_per_person_inr=100,
                  open_time_mins=0, close_time_mins=720),
            Place(place_id="test-b", name="Test B", place_type="attraction", lat=17.3720, lng=78.4650,
                  duration_minutes=90, estimated_cost_per_person_inr=100,
                  open_time_mins=0, close_time_mins=720),
            Place(place_id="test-dinner", name="Test Dinner", place_type="restaurant", lat=17.3800, lng=78.4600,
                  duration_minutes=60, estimated_cost_per_person_inr=100,
                  open_time_mins=0, close_time_mins=900),
        ]
        self.plan = self.make_plan()
        provider = Mock()
        provider.get_places.return_value = self.places
        self.provider_patch = patch("tripweave.provider.get_places_provider", return_value=provider)
        self.provider_patch.start()
        self.addCleanup(self.provider_patch.stop)

    def make_plan(self, closed_days=None):
        activities = [
            ScheduledActivity(place_id="test-a", place_name="Test A", place_type="attraction",
                              lat=17.3616, lng=78.4747, start_time="09:00 AM", end_time="11:00 AM",
                              estimated_cost_inr=200),
            ScheduledActivity(place_id="test-b", place_name="Test B", place_type="attraction",
                              lat=17.3720, lng=78.4650, start_time="12:30 PM", end_time="02:00 PM",
                              estimated_cost_inr=200),
        ]
        if closed_days:
            activities[0].place_id = "test-closed"
            activities[0].is_locked = True
        hotel = HotelStaySummary(
            hotel_id="test-hotel", hotel_name="Test Hotel", lat=17.3900, lng=78.4800,
            price_per_night_per_room=1000, rooms_needed=1, nights=1,
            people_accommodated=2, total_cost_inr=1000, provenance="test fixture",
        )
        expense = ExpenseBreakdown(
            lodging_inr=1000, transit_inr=500, activities_inr=400,
            direct_subtotal_inr=1900, unallocated_buffer_inr=8100,
            buffer_inr=8100, budget_limit_inr=10000, total_inr=10000,
            suggested_meals_inr=1600, estimated_meals_inr=1600,
        )
        return TripPlan(
            plan_name="Unit Test Plan", transport_mode=TransportMode.CAB,
            hotel_summary=hotel, estimated_transport_cost_inr=500,
            days=[DayPlan(day_number=1, date="2026-10-06", day_of_week="Tuesday",
                          activities=activities, day_cost_inr=400)],
            total_cost_inr=1900, expense_breakdown=expense,
            fatigue_report={"group_profile": GroupProfile.DEFAULT.value},
        )

    def request(self, **updates):
        data = dict(
            destination="Hyderabad", plan=self.plan, day_number=1,
            current_time_str="08:00", current_activity_index=-1,
            tiredness_level=TirednessSeverity.MILD, people_count=2,
            transport_mode=TransportMode.CAB, pace=PacePreference.BALANCED,
            budget_limit_inr=10000,
        )
        data.update(updates)
        return RebalanceTiredRequest(**data)

    def test_time_inputs_are_strict_and_clamps_do_not_hide_overnight(self):
        self.assertEqual(_parse_time_str("02:30 PM").hour, 14)
        self.assertEqual(_parse_time_str("2:30 PM").hour, 14)
        with self.assertRaises(ValueError):
            _parse_time_str("not a time")
        with self.assertRaises(ValueError):
            _add_minutes(_parse_time_str("23:50"), 20)
        with self.assertRaises(ValidationError):
            self.request(current_time_str="not a time")
        with self.assertRaises(ValidationError):
            self.request(current_location_lat=17.3)

    def test_mild_relief_shortens_long_visits_and_emits_consistent_plan_totals(self):
        result = ItineraryEditor.rebalance_tired_day(self.request())
        revised_a = next(a for a in result.revised_day.activities if a.place_id == "test-a")
        revised_duration = (_parse_time_str(revised_a.end_time).hour * 60 + _parse_time_str(revised_a.end_time).minute) - (
            _parse_time_str(revised_a.start_time).hour * 60 + _parse_time_str(revised_a.start_time).minute
        )
        self.assertEqual(revised_duration, 96)
        self.assertEqual(result.updated_plan.total_cost_inr,
                         result.updated_plan.estimated_transport_cost_inr
                         + result.updated_plan.hotel_summary.total_cost_inr
                         + sum(day.day_cost_inr for day in result.updated_plan.days))
        expense = result.updated_plan.expense_breakdown
        self.assertEqual(expense.direct_subtotal_inr,
                         expense.lodging_inr + expense.transit_inr + expense.activities_inr + expense.dining_inr)
        self.assertEqual(result.updated_plan.estimated_transport_cost_inr,
                         self.plan.estimated_transport_cost_inr + result.transport_cost_delta_inr)
        self.assertEqual(result.new_fatigue_score, result.revised_day.fatigue_score)
        day_score = next(
            item["score"] for item in result.updated_plan.fatigue_report["daily_breakdown"]
            if item["day_number"] == result.revised_day.day_number
        )
        self.assertEqual(day_score, result.revised_day.fatigue_score)

    def test_budget_overrun_is_reported_and_blocks_application(self):
        result = ItineraryEditor.rebalance_tired_day(self.request(budget_limit_inr=1))
        self.assertFalse(result.is_feasible)
        self.assertFalse(result.budget_within_limit)
        self.assertEqual(result.updated_plan.expense_breakdown.unallocated_buffer_inr, 0)
        self.assertTrue(any("exceeds the budget" in note.lower() for note in result.feasibility_notes))

    def test_transport_cap_overrun_is_reported_separately(self):
        capped_plan = self.plan.model_copy(update={"transport_budget_limit_inr": 1})
        result = ItineraryEditor.rebalance_tired_day(self.request(plan=capped_plan, budget_limit_inr=10000))
        self.assertFalse(result.is_feasible)
        self.assertFalse(result.transport_budget_within_limit)
        self.assertIn("Exceeds cap of ₹1", result.updated_plan.transport_budget_status)

    def test_exact_gps_location_is_not_persisted_in_updated_plan(self):
        gps_location = (17.3001, 78.4001)
        result = ItineraryEditor.rebalance_tired_day(self.request(
            current_location_lat=gps_location[0], current_location_lng=gps_location[1],
        ))
        rest_break = next(a for a in result.revised_day.activities if a.place_type == "rest_break")
        self.assertNotEqual((rest_break.lat, rest_break.lng), gps_location)
        self.assertEqual((rest_break.lat, rest_break.lng), (self.plan.hotel_summary.lat, self.plan.hotel_summary.lng))

    def test_closed_locked_stop_makes_revision_infeasible(self):
        closed = self.places[0].model_copy(update={"place_id": "test-closed", "closed_days": ["tuesday"]})
        changed_activity = self.plan.days[0].activities[0].model_copy(update={
            "place_id": "test-closed", "is_locked": True,
        })
        changed_day = self.plan.days[0].model_copy(update={
            "activities": [changed_activity, self.plan.days[0].activities[1]],
        })
        plan = self.plan.model_copy(update={"days": [changed_day]})
        provider = Mock()
        provider.get_places.return_value = [closed, *self.places[1:]]
        with patch("tripweave.provider.get_places_provider", return_value=provider):
            result = ItineraryEditor.rebalance_tired_day(self.request(plan=plan, tiredness_level=TirednessSeverity.MILD))
        self.assertFalse(result.is_feasible)
        self.assertTrue(any("closed on Tuesday" in note for note in result.feasibility_notes))

    def test_exhausted_policy_accounts_for_trip_to_hotel(self):
        dinner = ScheduledActivity(
            place_id="test-dinner", place_name="Test Dinner", place_type="restaurant",
            lat=17.3800, lng=78.4600, start_time="07:00 PM", end_time="08:00 PM",
            estimated_cost_inr=200, is_locked=True,
        )
        day = self.plan.days[0].model_copy(update={"activities": [self.plan.days[0].activities[0], dinner]})
        plan = self.plan.model_copy(update={"days": [day]})
        provider = Mock()
        provider.get_places.return_value = self.places
        with patch("tripweave.provider.get_places_provider", return_value=provider):
            result = ItineraryEditor.rebalance_tired_day(self.request(
                plan=plan, current_activity_index=0, current_time_str="11:00",
                tiredness_level=TirednessSeverity.EXHAUSTED,
            ))
        self.assertTrue(any("trip from the current location to the hotel" in note for note in result.feasibility_notes))
        self.assertTrue(any(a.place_type == "rest_break" for a in result.revised_day.activities))
        self.assertEqual(result.updated_plan.total_cost_inr,
                         result.updated_plan.estimated_transport_cost_inr
                         + result.updated_plan.hotel_summary.total_cost_inr
                         + sum(d.day_cost_inr for d in result.updated_plan.days))

    def test_sunset_conflict_is_not_marked_feasible(self):
        sunset_place = self.places[0].model_copy(update={
            "place_id": "test-sunset", "name": "Sunset View", "golden_hour_recommended": True,
        })
        sunset_activity = self.plan.days[0].activities[0].model_copy(update={
            "place_id": "test-sunset", "place_name": "Sunset View",
            "experience_tag": "🌅 Scheduled for Astronomical Golden Hour Sunset",
            "start_time": "05:00 PM", "end_time": "06:00 PM", "is_locked": True,
        })
        day = self.plan.days[0].model_copy(update={"activities": [sunset_activity]})
        plan = self.plan.model_copy(update={"days": [day]})
        provider = Mock()
        provider.get_places.return_value = [sunset_place]
        with patch("tripweave.provider.get_places_provider", return_value=provider):
            result = ItineraryEditor.rebalance_tired_day(self.request(
                plan=plan, current_time_str="18:00", current_activity_index=-1,
                tiredness_level=TirednessSeverity.MILD,
            ))
        self.assertFalse(result.is_feasible)
        self.assertTrue(any("sunset window" in note.lower() for note in result.feasibility_notes))

    def test_overflow_is_reported_instead_of_clamped_to_1159_pm(self):
        result = ItineraryEditor.rebalance_tired_day(self.request(
            current_time_str="23:45", current_activity_index=-1,
            tiredness_level=TirednessSeverity.MILD,
        ))
        self.assertFalse(result.is_feasible)
        self.assertTrue(any("beyond this calendar day" in note.lower() for note in result.feasibility_notes))
        break_activity = next(a for a in result.revised_day.activities if a.place_type == "rest_break")
        self.assertIn("(+1 day)", break_activity.end_time)

    def test_leg_estimates_use_shared_mode_math_and_zero_distance_is_zero(self):
        start = (17.3616, 78.4747)
        end = (17.3720, 78.4650)
        expected_minutes, expected_cost = get_travel_metrics(*start, *end, mode="auto", people_count=5)
        _, actual_minutes, actual_cost = _estimated_leg(start, end, "auto", 5)
        self.assertEqual((actual_minutes, actual_cost), (expected_minutes, expected_cost))
        self.assertEqual(_estimated_leg(start, start, "cab", 2), (0.0, 0, 0))


if __name__ == "__main__":
    main()
