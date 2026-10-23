import unittest
from types import SimpleNamespace
from tripweave.models import TripRequest, DiscoveryPlanningPolicy, ConfirmedDiscoveryStop
from tripweave.planning_candidates import expand_request

class AutoDiscoveryFilterTests(unittest.TestCase):
    def test_auto_burial_ground_excluded_but_manual_input_preserved(self):
        pinned = ConfirmedDiscoveryStop(place_id='manual', name='Historic Cemetery', lat=17.4, lng=78.4,
            place_type='attraction', duration_minutes=60, estimated_cost_per_person_inr=0, open_time_mins=60, close_time_mins=600)
        request = TripRequest(destination='hyderabad', days=2, budget_inr=20000, people_count=2,
            discovery_policy=DiscoveryPlanningPolicy(), external_stops=[pinned], locked_activities=['discovered:manual'])
        provider = SimpleNamespace(search=lambda location, category: {'places': [] if category=='restaurants' else [
            {'id':'burial','name':'Muslim Graveyard','category':'attractions','lat':17.3,'lng':78.3},
            {'id':'museum','name':'City Museum','category':'attractions','lat':17.5,'lng':78.5}]})
        result = expand_request(request, provider, [])
        self.assertEqual([p.name for p in result.external_stops], ['Historic Cemetery','City Museum'])
        self.assertEqual(result.locked_activities, request.locked_activities)

if __name__ == '__main__': unittest.main()
