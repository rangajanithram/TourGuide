"""Controlled token verification tests. No live accounts or outgoing requests."""
import io
import json
import time
import unittest
from unittest.mock import patch
from urllib.error import URLError

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from tripweave.auth import get_current_user
from tripweave.config import settings

USER_ID = "11111111-1111-4111-8111-111111111111"
PROJECT = "https://example.supabase.co"


class AuthSecurityTests(unittest.TestCase):
    def setUp(self):
        self.config = patch.multiple(settings, supabase_url=PROJECT, supabase_publishable_key="sb_publishable_test")
        self.config.start()
        self.addCleanup(self.config.stop)
        self.user = {"id": USER_ID, "email": "test@example.com", "email_confirmed_at": "2026-10-09",
                     "created_at": "2026-10-09", "app_metadata": {"provider": "email"}}

    def token(self, **overrides):
        claims = {"sub": USER_ID, "iss": PROJECT + "/auth/v1", "aud": "authenticated",
                  "role": "authenticated", "exp": time.time() + 300, "iat": time.time()}
        claims.update(overrides)
        return jwt.encode(claims, "controlled-test-key-at-least-thirty-two-bytes", algorithm="HS256")

    def response(self):
        return io.BytesIO(json.dumps(self.user).encode())

    def assert_unauthorized(self, token):
        with patch("tripweave.auth.urlopen", return_value=self.response()):
            with self.assertRaises(HTTPException) as caught:
                get_current_user("Bearer " + token)
        self.assertEqual(caught.exception.status_code, 401)

    def test_provider_validated_identity(self):
        with patch("tripweave.auth.urlopen", return_value=self.response()) as provider:
            result = get_current_user("Bearer " + self.token())
        self.assertEqual(result.id, USER_ID)
        self.assertEqual(provider.call_args.args[0].full_url, PROJECT + "/auth/v1/user")

    def test_wrong_issuer_audience_expiry_subject_and_role(self):
        for claims in [{"iss": "https://other.supabase.co/auth/v1"}, {"aud": "anon"}, {"exp": time.time() - 1},
                       {"sub": "22222222-2222-4222-8222-222222222222"}, {"role": "service_role"}]:
            with self.subTest(claims=claims):
                self.assert_unauthorized(self.token(**claims))

    def test_unverified_user_and_anonymous_user_rejected(self):
        self.user["email_confirmed_at"] = None
        self.assert_unauthorized(self.token())
        self.user["email_confirmed_at"] = "2026-10-09"
        self.user["is_anonymous"] = True
        self.assert_unauthorized(self.token())

    def test_unsigned_token_rejected_before_network(self):
        with patch("tripweave.auth.urlopen") as provider:
            self.assert_unauthorized(jwt.encode({"sub": USER_ID}, key="", algorithm="none"))
            provider.assert_not_called()

    def test_provider_outage_is_not_an_invalid_password(self):
        with patch("tripweave.auth.urlopen", side_effect=URLError("offline")):
            with self.assertRaises(HTTPException) as caught:
                get_current_user("Bearer " + self.token())
        self.assertEqual(caught.exception.status_code, 503)

    def test_disabled_configuration_fails_closed(self):
        with patch.object(settings, "supabase_url", None):
            with self.assertRaises(HTTPException) as caught:
                get_current_user("Bearer anything")
        self.assertEqual(caught.exception.status_code, 503)

    def test_asymmetric_signature_is_verified_before_identity_lookup(self):
        signing_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        claims = jwt.decode(self.token(), options={"verify_signature": False})
        for key, valid in [(signing_key, True), (attacker_key, False)]:
            token = jwt.encode(claims, key, algorithm="RS256", headers={"kid": "controlled-key"})
            with patch("tripweave.auth.jwks_client") as jwks, patch("tripweave.auth.urlopen", return_value=self.response()) as provider:
                jwks.return_value.get_signing_key_from_jwt.return_value = jwt.PyJWK.from_dict(
                    json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(signing_key.public_key()))
                )
                if valid:
                    self.assertEqual(get_current_user("Bearer " + token).id, USER_ID)
                    provider.assert_called_once()
                else:
                    with self.assertRaises(HTTPException) as caught:
                        get_current_user("Bearer " + token)
                    self.assertEqual(caught.exception.status_code, 401)
                    provider.assert_not_called()


if __name__ == "__main__":
    unittest.main()


class PlannerAccessTests(unittest.TestCase):
    def test_every_itinerary_route_requires_verified_identity(self):
        from tripweave.main import app
        routes = [r for r in app.routes if getattr(r, 'path', '').startswith('/api/itinerary/')]
        self.assertEqual(len(routes), 5)
        for route in routes:
            self.assertIn(get_current_user, [dependency.call for dependency in route.dependant.dependencies], route.path)
