# AfuChat post-login profile flow

## Findings before the fix

The login flow was already obtaining a shared Supabase session. Email login uses `supabase.auth.signInWithPassword`; username/phone login first resolves the identifier through the existing AfuAuth API. The Supabase client persists native sessions in AsyncStorage and web sessions in localStorage. This login flow was not changed.

After `SIGNED_IN`, `AuthContext.fetchProfile` queried `profiles` directly through the Supabase SDK. It did not call an AfuChat current-user API. The query was a `GET` to the shared project's PostgREST `profiles` resource, filtered by the signed-in user's ID, with the profile fields required by the mobile `Profile` type and `.single()` response semantics. The SDK supplies its public `apikey`, the session bearer token, and the `public` schema selection.

The live AfuChat Worker health endpoint returned `200`. Before this change, a request to `GET https://api.afuchat.com/v1/chat/me` returned `501` with `{"error":"The requested API endpoint is not available.","request_id":"..."}`. The route had no handler. The existing `GET /v1/chat/conversations` route did require a bearer token and returned `401` when one was absent.

A read-only PostgREST schema probe using `limit=0` returned `200` for the profile fields selected by hydration and the account-deletion guard. This verifies those field names are recognized by the shared `profiles` resource; it does not verify that a particular logged-in user's row exists. No real test-account session was available in this workspace, so the exact authenticated response from the old direct profile query and that account's row could not be confirmed.

## Confirmed root cause and scope

The confirmed implementation gap was that post-login profile hydration bypassed the AfuChat API, while the AfuChat Worker had no current-profile handler. Consequently, there was no working AfuChat-owned request path that could resolve the shared Afu identity and return the mobile profile. `fetchProfile` also falls back to cached data (or `null`) on profile errors, which can make a successful login appear to finish without loading fresh profile data.

This confirms the API/client flow was incomplete; it does not claim a specific authenticated PostgREST error for an account that was not available to test. No profile or user table was created, duplicated, or migrated.

## Implemented flow

1. The existing Supabase login and session persistence remain unchanged.
2. On profile hydration, the mobile app reads the current session token. If it is near expiry, the existing token helper attempts a refresh.
3. The app sends `GET https://api.afuchat.com/v1/chat/me` with `Accept: application/json` and `Authorization: Bearer <shared Supabase access token>`. It does not send a user ID.
4. The AfuChat Worker validates the bearer through its AfuAuth service binding by calling `POST /v1/auth/session`. It requires the returned access token to match the incoming bearer exactly and takes the user ID only from that verified result.
5. The Worker queries the existing shared Supabase `public.profiles` resource for that verified ID, forwarding the same bearer token and using the existing anon key/RLS path. It selects the fields used by the mobile `Profile` type and returns the single profile row in the same object shape expected by `AuthContext`.
6. The mobile app checks that the returned profile ID matches the signed-in user's ID before caching and exposing it.
7. Missing/invalid sessions are rejected before the profile query. Missing rows return a generic `404`; upstream/database errors return a generic `502`/`503`. Internal logs retain request ID and status/code only; public responses omit infrastructure details.

Subscription, equipped-goods, and the login-time account-deletion checks retain their existing Supabase SDK calls. They were not part of this profile-route change.

## Verification status

Worker unit tests cover the verified token handoff, identity-derived lookup (including ignoring a caller-supplied ID), returned mobile profile shape, missing/invalid session rejection, missing profile, and sanitized database failures. The AfuChat deployment script's postflight now checks that `/v1/chat/me` rejects unauthenticated and invalid sessions.

The Worker has not been deployed as part of this code change. Therefore production still serves the pre-change response until an authorized deployment. A real login → profile hydration → logout → rejected request → login-again test remains pending deployment and a real test account; no credentials should be shared in chat.
