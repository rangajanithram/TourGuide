"""Readiness is real catalog/config validation; no live accounts or network calls."""
import unittest
import json
import os
from unittest.mock import patch
from tripweave.main import readiness_check, health_check
from tripweave.config import settings, Settings


class ReadinessTests(unittest.TestCase):
    def test_capacity_environment_values_are_bounded(self):
        for name, value in (("SOLVER_CONCURRENCY", "0"), ("SOLVER_CONCURRENCY", "100"),
                            ("SOLVER_QUEUE_TIMEOUT_SECONDS", "0"), ("SOLVER_QUEUE_TIMEOUT_SECONDS", "nan")):
            with patch.dict(os.environ, {name: value}):
                with self.assertRaises(ValueError):
                    Settings()

    def setUp(self):
        self.config = patch.multiple(settings, supabase_url="https://example.supabase.co",
                                     supabase_publishable_key="test-public-key")
        self.config.start()
        self.addCleanup(self.config.stop)

    def test_real_catalogs_ready_and_not_claimed_live(self):
        response = readiness_check()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.body)["status"], "ready")
        self.assertFalse(json.loads(response.body)["external_services_verified"])
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_missing_auth_is_not_ready_but_process_is_alive(self):
        with patch.object(settings, "supabase_publishable_key", None):
            self.assertEqual(readiness_check().status_code, 503)
            self.assertEqual(health_check()["status"], "healthy")

    def test_missing_catalog_does_not_disclose_server_paths(self):
        with patch("tripweave.main.get_places_provider", side_effect=FileNotFoundError("private/server/path")):
            response = readiness_check()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private/server/path", response.body.decode())
        self.assertEqual(response.headers["retry-after"], "5")

    def test_empty_or_duplicate_catalog_is_not_ready(self):
        from tripweave.provider import get_places_provider
        places = get_places_provider().get_places("hyderabad")
        for rows in ([], places + [places[0]]):
            with patch("tripweave.main.get_places_provider") as provider:
                provider.return_value.get_supported_cities.return_value = ["hyderabad"]
                provider.return_value.get_places.return_value = rows
                self.assertEqual(readiness_check().status_code, 503)


if __name__ == "__main__":
    unittest.main()
