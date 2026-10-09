"""Validate Supabase bearer tokens; credentials and sessions stay with Supabase.

Asymmetric JWTs are verified against the configured project's JWKS, then the
Auth server confirms the user. Legacy HS256 JWTs are verified by that server;
their issuer/audience/expiry are also checked after successful verification.
No tokens, passwords, or provider error bodies are logged.
"""
import json
import time
from functools import lru_cache
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import UUID

import jwt
from fastapi import Header, HTTPException
from pydantic import BaseModel

from tripweave.config import settings


class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    auth_provider: str
    created_at: str


def unauthorized():
    return HTTPException(401, "Invalid or expired session.", headers={"WWW-Authenticate": "Bearer"})


@lru_cache(maxsize=4)
def jwks_client(project_url: str):
    return jwt.PyJWKClient(project_url + "/auth/v1/.well-known/jwks.json", timeout=5)


def get_current_user(authorization: str = Header(default="")) -> UserProfile:
    project_url = (settings.supabase_url or "").rstrip("/")
    key = settings.supabase_publishable_key
    parsed = urlparse(project_url)
    local = settings.environment != "production" and parsed.hostname in {"localhost", "127.0.0.1"}
    if not key or not project_url or "your-project" in project_url or (parsed.scheme != "https" and not local):
        raise HTTPException(503, "Account authentication is not configured.")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or len(parts[1]) > 16384:
        raise unauthorized()
    token = parts[1]
    issuer = project_url + "/auth/v1"
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
        if algorithm in {"RS256", "ES256"}:
            signing_key = jwks_client(project_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(token, signing_key, algorithms=[algorithm], audience="authenticated", issuer=issuer,
                                options={"require": ["exp", "iat", "sub", "iss", "aud"]})
        elif algorithm == "HS256":
            # Signature is verified remotely below, never with the public API key.
            claims = jwt.decode(token, options={"verify_signature": False})
        else:
            raise unauthorized()

        request = Request(project_url + "/auth/v1/user", headers={"apikey": key, "Authorization": "Bearer " + token})
        with urlopen(request, timeout=5) as response:
            user = json.loads(response.read(65537))
        # In the legacy branch the provider has now validated the signature.
        audience = claims.get("aud")
        valid_audience = audience == "authenticated" or (isinstance(audience, list) and "authenticated" in audience)
        if (claims.get("iss") != issuer or not valid_audience or not isinstance(claims.get("exp"), (int, float))
                or claims["exp"] <= time.time() or claims.get("sub") != user.get("id")
                or claims.get("role") != "authenticated" or not user.get("email_confirmed_at")
                or user.get("is_anonymous")):
            raise unauthorized()
        UUID(user["id"])
        metadata = user.get("user_metadata") or {}
        return UserProfile(id=user["id"], email=user.get("email") or "", name=str(metadata.get("name") or "Traveler")[:80],
                           auth_provider=str((user.get("app_metadata") or {}).get("provider") or "email"),
                           created_at=user.get("created_at") or "")
    except HTTPException:
        raise
    except HTTPError as error:
        if error.code in {401, 403}:
            raise unauthorized() from None
        raise HTTPException(503, "Sign-in service temporarily unavailable.") from None
    except (URLError, TimeoutError, jwt.PyJWKClientConnectionError):
        raise HTTPException(503, "Sign-in service temporarily unavailable.") from None
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        raise unauthorized() from None
