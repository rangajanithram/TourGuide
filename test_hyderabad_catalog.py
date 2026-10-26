"""Expanded destination data must reach search, meals and the verified planner."""
import unittest
from collections import Counter
from unittest.mock import patch
from tripweave.catalog import ExpandedPlacesProvider, hyderabad_supplement
from tripweave.provider import JsonFilePlacesProvider, DatabaseCatalogUnavailable, get_places_provider
from tripweave.rating_evidence import attach_rating_evidence
from tripweave.main import planner_catalog, _build_single_plan
from tripweave.models import TripRequest, TripPlan
from tripweave.planning_candidates import meal_candidates


class HyderabadCatalogTests(unittest.TestCase):
    def test_every_supplement_place_has_identity_location_and_honest_source(self):
        rows = get_places_provider().get_places('hyderabad')
        self.assertEqual(Counter(p.place_type for p in rows), {'attraction':32,'restaurant':11,'hotel':7})
        self.assertEqual(len({p.place_id for p in rows}), len(rows))
        for p in hyderabad_supplement():
            self.assertTrue(17.15 < p.lat < 17.6 and 78.2 < p.lng < 78.8, p.name)
            self.assertTrue(p.source_urls, p.name)
            self.assertIsNone(p.last_verified_date, 'Research is not verification of prices/hours')
            self.assertEqual(p.verification_status,'estimated')
        self.assertEqual(next(p for p in rows if p.place_id=='hyd_snow').lat,17.4143801)

    def test_ten_real_attractions_have_matching_samples_without_chain_joins(self):
        places=attach_rating_evidence(get_places_provider().get_places('hyderabad'),'hyderabad')
        rated=[p for p in places if p.rating_evidence]
        self.assertEqual(len(rated),10)
        self.assertEqual(sum(p.review_count for p in rated),1055)
        for p in rated:
            self.assertEqual(p.place_type,'attraction')
            self.assertIn('sample mean',p.rating_evidence)
        self.assertEqual(next(p for p in rated if p.name=='Wonderla Hyderabad').review_count,120)
        self.assertEqual(next(p for p in rated if p.name=='Durgam Cheruvu Cable Bridge').review_count,46)
        self.assertTrue(all(p.rating is None for p in places if p.place_type=='restaurant'))

    def test_supplement_survives_storage_choice_and_does_not_hide_database_failure(self):
        base=JsonFilePlacesProvider()
        provider=ExpandedPlacesProvider(base)
        first=provider.get_places('Hyderabad')
        first[-1].name='changed'
        self.assertNotEqual(provider.get_places('hyderabad')[-1].name,'changed')
        self.assertEqual(len(provider.get_places('jaipur')),len(base.get_places('jaipur')))
        with patch.object(base,'get_places',side_effect=DatabaseCatalogUnavailable('unavailable')):
            with self.assertRaises(DatabaseCatalogUnavailable): provider.get_places('hyderabad')

    def test_search_contract_lists_destinations_aliases_sources_and_counts(self):
        catalog=planner_catalog('hyderabad')
        self.assertEqual(len(catalog['places']),43)
        self.assertEqual(catalog['catalog_counts']['hotel'],7)
        self.assertNotIn('coastal',catalog['interests'])
        self.assertNotIn('snack_only',catalog['interests'])
        cable=next(p for p in catalog['places'] if p['value']=='hyd_cable_bridge')
        self.assertIn('Cable Bridge',cable['search_aliases'])
        self.assertTrue(cable['source_urls'])
        self.assertTrue(cable['planning_window_estimated'])

    def test_snacks_do_not_replace_meals_or_claim_chain_ratings(self):
        places=get_places_provider().get_places('hyderabad')
        req=TripRequest(destination='hyderabad',days=3,start_date='2026-11-04',budget_inr=30000,people_count=2,meal_budget_per_person=200)
        base=next(p for p in places if p.place_type=='hotel')
        meals=meal_candidates(req,places,base)
        self.assertEqual(len(meals),9)
        self.assertFalse(any(m.meal_venue_id in {'hyd_nimrah','hyd_karachi_mozzam'} for m in meals))
        self.assertGreaterEqual(len({m.meal_venue_id for m in meals if m.meal_venue_id}),3)

    def test_new_pinned_landmarks_are_scheduled_saved_and_independently_checked(self):
        req=TripRequest(destination='hyderabad',days=3,start_date='2026-11-04',budget_inr=30000,people_count=2,
                        meal_budget_per_person=200,locked_activities=['hyd_birla_science','hyd_shilparamam','hyd_ntr_gardens'])
        plan=_build_single_plan(req)
        self.assertTrue(plan.verification_report.is_valid,plan.verification_report.errors)
        visits=[a for d in plan.days for a in d.activities if a.place_type=='attraction']
        self.assertTrue(set(req.locked_activities).issubset({a.place_id for a in visits}))
        self.assertGreaterEqual(len({d.day_number for d in plan.days if any(a.place_type=='attraction' for a in d.activities)}),2)
        reopened=TripPlan.model_validate_json(plan.model_dump_json())
        self.assertEqual(len(reopened.days),3)
        self.assertLessEqual(plan.total_cost_inr,req.budget_inr)


if __name__=='__main__': unittest.main()
