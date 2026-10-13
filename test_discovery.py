import json
import unittest
from io import BytesIO
from unittest.mock import patch
from fastapi import HTTPException
from tripweave.discovery import DiscoveryProvider

class DiscoveryTests(unittest.TestCase):
    def test_missing_key_makes_no_request(self):
        def forbidden(*a, **k): self.fail('Network called without key')
        with self.assertRaises(HTTPException) as error:
            DiscoveryProvider(None, opener=forbidden).search('Paris','parks')
        self.assertEqual(error.exception.status_code,503)
    def test_mapping_bounds_and_no_invented_facts(self):
        responses=iter([{'features':[{'properties':{'lat':48.8,'lon':2.3,'formatted':'Paris'}}]},
            {'features':[{'properties':{'name':'Garden','place_id':'x','lat':48.8,'lon':2.3,'formatted':'Paris'}},None,{'properties':{}}]}])
        urls=[]
        def opener(url,timeout):
            urls.append(url);return BytesIO(json.dumps(next(responses)).encode())
        result=DiscoveryProvider('private-key',opener=opener).search('Paris','parks')
        self.assertEqual(len(result['places']),1)
        self.assertNotIn('opening_hours',result['places'][0])
        self.assertIn('limit=20',urls[1]);self.assertIn('leisure.park',urls[1])
    def test_allowance_prevents_second_call(self):
        provider=DiscoveryProvider('key',daily_limit=1,opener=lambda *a,**k:BytesIO(b'{"features":[]}'))
        provider.search('Paris','parks')
        with self.assertRaises(HTTPException) as error: provider.search('Paris','parks')
        self.assertEqual(error.exception.status_code,429)
    def test_provider_error_is_sanitized(self):
        def broken(*a,**k):raise ValueError('secret key in URL')
        with self.assertRaises(HTTPException) as error: DiscoveryProvider('key',opener=broken).search('Paris','parks')
        self.assertNotIn('secret',error.exception.detail)

if __name__=='__main__':unittest.main()
