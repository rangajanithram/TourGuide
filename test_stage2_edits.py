"""Regression tests for verified edits and full-route accounting."""
from unittest import TestCase, main
import test_rebalance
from unittest.mock import patch, Mock
from tripweave.editor import ItineraryEditor
from tripweave.models import EditConsequenceRequest, EditActionType, TripRequest, TransportMode
from tripweave.verifier import ItineraryVerifier
from tripweave.route_accounting import trip_transport_cost
from tripweave.distance import get_travel_metrics

class Stage2EditTests(TestCase):
    def setUp(self):
        test_rebalance.LiveRebalanceTests.setUp(self)
        provider = Mock()
        provider.get_places.return_value = self.places
        edit_provider = patch('tripweave.editor.get_places_provider', return_value=provider)
        edit_provider.start()
        self.addCleanup(edit_provider.stop)
    make_plan = test_rebalance.LiveRebalanceTests.make_plan
    request = test_rebalance.LiveRebalanceTests.request

    def verified_request(self):
        return TripRequest(destination='hyderabad', days=1, start_date='2026-10-06', budget_inr=10000, people_count=2)

    def test_zero_distance_never_charges_a_minimum_fare(self):
        for mode in ('cab','auto','metro','walk'):
            self.assertEqual(get_travel_metrics(17.3,78.4,17.3,78.4,mode,2), (0,0))

    def test_remove_preserves_remaining_appointments_and_reconciles_complete_route(self):
        result = ItineraryEditor.preview_edit(EditConsequenceRequest(destination='hyderabad',plan=self.plan,day_number=1,activity_index=0,action=EditActionType.REMOVE,people_count=2))
        remaining = result.updated_plan.days[0].activities[0]
        self.assertEqual(remaining.start_time,self.plan.days[0].activities[1].start_time)
        expected = trip_transport_cost(result.updated_plan.days,(self.plan.hotel_summary.lat,self.plan.hotel_summary.lng),'cab',2)
        self.assertEqual(result.updated_plan.estimated_transport_cost_inr,expected)
        self.assertEqual(result.delta_cost_inr,result.updated_plan.total_cost_inr-self.plan.total_cost_inr)
        self.assertTrue(result.is_feasible)

    def test_pin_keeps_the_actual_variant_transport_mode(self):
        plan = self.plan.model_copy(update={'transport_mode':TransportMode.AUTO})
        result = ItineraryEditor.preview_edit(EditConsequenceRequest(destination='hyderabad',plan=plan,day_number=1,activity_index=0,action=EditActionType.PIN,people_count=2))
        self.assertEqual(result.updated_plan.transport_mode,TransportMode.AUTO)
        self.assertTrue(result.is_feasible)

    def test_swap_and_sunset_always_return_complete_route_deltas(self):
        for action in (EditActionType.SWAP, EditActionType.MOVE_TO_SUNSET):
            result = ItineraryEditor.preview_edit(EditConsequenceRequest(
                destination='hyderabad', plan=self.plan, day_number=1, activity_index=0,
                action=action, replacement_place_id='test-dinner', people_count=2))
            self.assertEqual(result.delta_cost_inr, result.updated_plan.total_cost_inr - self.plan.total_cost_inr)
            self.assertIsInstance(result.delta_transit_km, float)
            self.assertIsInstance(result.delta_transit_minutes, int)
            self.assertEqual(result.is_feasible, result.updated_plan.verification_report.is_valid)

    def test_impossible_transit_is_an_error_not_a_warning(self):
        plan=self.plan.model_copy(deep=True)
        plan.days[0].activities[1].start_time='11:01 AM'
        report=ItineraryVerifier.verify(plan,self.verified_request(),self.places)
        self.assertFalse(report.is_valid)
        self.assertTrue(any('Tight Transit' in e for e in report.errors))

    def test_unknown_venues_and_malformed_time_cannot_be_verified(self):
        for mutation in ('unknown','time'):
            plan=self.plan.model_copy(deep=True)
            if mutation=='unknown':
                plan.days[0].activities[0].place_id='unlisted'
                plan.days[0].activities[0].place_name='Unlisted'
            else: plan.days[0].activities[0].start_time='invalid'
            self.assertFalse(ItineraryVerifier.verify(plan,self.verified_request(),self.places).is_valid)

    def test_calendar_date_wins_over_spoofed_weekday(self):
        plan=self.plan.model_copy(deep=True)
        plan.days[0].day_of_week='Monday'
        self.places[0].closed_days=['Tuesday']
        report=ItineraryVerifier.verify(plan,self.verified_request(),self.places)
        self.assertTrue(any('Closure Violation' in e for e in report.errors))

    def test_no_remaining_stops_still_requires_verification(self):
        bad=self.plan.model_copy(update={'total_cost_inr':1})
        result=ItineraryEditor.rebalance_tired_day(self.request(plan=bad,current_time_str='20:00',current_activity_index=1))
        self.assertFalse(result.is_feasible)
        self.assertIsNotNone(result.updated_plan.verification_report)

if __name__=='__main__': main()
