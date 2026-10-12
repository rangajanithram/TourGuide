import json
import unittest
from unittest.mock import Mock
from tripweave.provider import SupabasePlacesProvider, DatabaseCatalogUnavailable
from pathlib import Path

class CatalogTests(unittest.TestCase):
 def provider(self, opener=None, clock=lambda: 0):
  rows=[{'place_id':p['place_id'],'payload':p,'reviewed_at':None,'source_urls':[]} for p in json.loads(Path('data/hyderabad_mock.json').read_text())]
  response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False);response.read.return_value=json.dumps(rows).encode()
  return SupabasePlacesProvider('https://example.supabase.co','public-test-key',opener=opener or Mock(return_value=response),clock=clock)
 def test_read_cached_cloned_and_review_date_unknown(self):
  p=self.provider(); places=p.get_places('Hyderabad'); self.assertIsNone(places[0].last_verified_date)
  places[0].name='changed';self.assertNotEqual(p.get_places('hyderabad')[0].name,'changed');self.assertEqual(p.opener.call_count,1)
  self.assertEqual(p.opener.call_args.kwargs['timeout'],8)
 def test_expired_cache_does_not_hide_outage(self):
  now=[0];p=self.provider(clock=lambda:now[0]);p.get_places('hyderabad');now[0]=61;p.opener.side_effect=OSError('secret body')
  with self.assertRaises(DatabaseCatalogUnavailable) as failure:p.get_places('hyderabad')
  self.assertNotIn('secret',str(failure.exception))
 def test_invalid_payload_rejected(self):
  p=self.provider();p.opener.return_value.read.return_value=b'[]'
  with self.assertRaises(DatabaseCatalogUnavailable):p.get_places('hyderabad')
 def test_other_cities_remain_compatible(self):
  p=self.provider();self.assertTrue(p.get_places('jaipur'));p.opener.assert_not_called()

if __name__=='__main__':unittest.main()
