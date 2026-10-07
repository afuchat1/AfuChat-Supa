# AfuChat post-login profile flow

## Findings before the fix

The login flow was already obtaining a shared Supabase session. Email login uses `supabase.auth.signInWithPassword`; username/phone login first resolves the identifier through the existing AfuAuth API. The Supabase client persists native sessions in AsyncStorage and web sessions in localStorage. This login flow was not changed.

After `SIGNED_IN`, `AuthContext.fetchProfile` queried `profiles` directly through the Supabase SDK. It did not call an AfuChat current-user API. The query was a `GET` to the shared project's PostgREST `profiles` resource, filtered by the signed-in user's ID, with the profile fields required by the mobile `Profile` type and `.single()` response semantics. The SDK supplies its public `apikey`, the session bearer token, and the `public` schema selection.

The live AfuChat Worker health endpoint returned `200`. Before this change, a request to `GET https://api.afuchat.com/v1/chat/me` returned `501` with `{"error":"The requested API endpoint is not available.","request_id":"..."}`. The route had no handler. The existing `GET /v1/chat/conversations` route did require a bearer token and returned `401` when one was absent.

A read-only PostgREST schema probe using `limit=0` returned `200` for the profile fields selected by hydration and the account-deletion guard. This verifies those field names are recognized by the shared `profiles` resource; it does not verify that a particular logged-in user's row exists. No real test-account session was available in this workspace, so the exact authenticated response from the old direct profile query and that account's row could not be confirmed.

## Confirmed root cause and scope

The confirmed production failure was that `GET /v1/chat/me` reached the canonical AfuChat API route, but the deployed Worker still had no current-profile handler and returned `501`. The local app and Worker implementation had already been updated, but that Worker version had not reached production. This was not a missing login token or a wrong API hostname. `fetchProfile` falls back to cached data (or `null`) on profile errors, which made successful login appear to finish without loading fresh profile data.

The original direct profile lookup was replaced with the AfuChat-owned current-profile endpoint. No profile or user table was created, duplicated, or migrated.

## Implemented flow

1. The existing Supabase login and session persistence remain unchanged.
2. On profile hydration, the mobile app reads the current session token. If it is near expiry, the existing token helper attempts a refresh.
3. The app sends `GET https://api.afuchat.com/v1/chat/me` with `Accept: application/json` and `Authorization: Bearer <shared Supabase access token>`. It does not send a user ID.
4. The AfuChat Worker validates the bearer through its AfuAuth service binding by calling `POST /v1/auth/session`. It requires the returned access token to match the incoming bearer exactly and takes the user ID only from that verified result.
5. The Worker queries the existing shared Supabase `public.profiles` resource for that verified ID, forwarding the same bearer token and using the existing anon key/RLS path. It selects the fields used by the mobile `Profile` type and returns the single profile row in the same object shape expected by `AuthContext`.
6. The mobile app checks that the returned profile ID matches the signed-in user's ID before caching and exposing it.
7. Missing/invalid sessions are rejected before the profile query. Missing rows return a generic `404`; upstream/database errors return a generic `502`/`503`. Internal logs retain request ID and status/code only; public responses omit infrastructure details.

The AfuChat/AfuAuth client API origin is pinned to `https://api.afuchat.com`; the deprecated `EXPO_PUBLIC_AFUCLOUD_API_URL` and `EXPO_PUBLIC_AFUCHAT_API_URL` overrides are ignored. The current-user endpoint is exactly `GET /v1/chat/me`. Username/phone identifier resolution remains on AfuAuth's `/v1/auth/resolve-identifier`; the working login flow was not changed.

Subscription, equipped-goods, and login-time account-deletion checks retain their existing direct Supabase SDK calls. They were not moved by this profile-route fix.

## Verification status

### Production deployment

On 2026-10-07, `backend/afu-chat-api/deploy.mjs --apply` deployed the current Worker to the existing `afuchat-api` script. It preserved the existing `api.afuchat.com/v1/chat/*` route, `AFUAUTH_API` service binding, and `afuchat-media` bucket binding. No other product Worker, route, or database was changed. The first attempt was rolled back because postflight checked the old response during edge propagation; the deploy check now waits for `/v1/chat/me` to return the expected unauthenticated `401` before continuing. The next deployment passed all configured postflight checks.

### Endpoint inventory and checks

All AfuChat client API calls use the pinned `https://api.afuchat.com` origin. The app's current API call inventory and production status are:

| Endpoint group | Production verification |
|---|---|
| `GET /v1/chat/healthz`, `GET|POST /v1/chat/status` | `200`; status reports `ok: true` |
| `GET /v1/chat/me` | No bearer: `401`; invalid bearer: `401`; authenticated profile response: pending real-account test |
| `GET /v1/chat/conversations` | No bearer: `401`; unit tests verify shared-session identity and the same bearer reaches Supabase RLS |
| `POST /v1/chat/support/ai-reply`, `/v1/chat/push/register`, `/v1/chat/push/send` | No bearer: `401`; unit tests cover validation, identity derivation, and sanitized failures |
| `POST /v1/chat/account/export`, `/v1/chat/payments/pesapal-initiate` | No bearer: `401`; account export and payment validation have Worker unit coverage |
| Pesapal callback/IPN routes | Included in the deployed Worker; no live transaction or payment-provider callback was triggered |
| `/v1/chat/storage/*` | Deployed through the canonical chat router to the preserved legacy media handler and existing `afuchat-media` bucket; router and mapping tests pass |
| `/v1/chat/videos` and `/v1/chat/videos/*` | Route is present but intentionally returns `501` while the server-side video processing pipeline is unavailable. The app keeps the source-video fallback; this is a known limitation, not part of profile hydration. |

The AfuAuth health route remains healthy at `/v1/auth/healthz`. The AfuChat Worker validates session tokens through its `AFUAUTH_API` service binding; that internal `POST /v1/auth/session` call is not a public AfuChat route. No old Worker hostname or `afucloud-api` user-data route was found in the AfuChat client API call sites.

### Remaining real-account verification

Worker unit tests cover the verified token handoff, identity-derived lookup (including ignoring a caller-supplied ID), returned mobile profile shape, missing/invalid session rejection, missing profile, and sanitized database failures. A read-only PostgREST `limit=0` probe returned `200` for the selected profile fields and read no user rows.

No real test-account login was performed. The authenticated profile row, fresh login, restored session, app hydration, logout, protected-request rejection after logout, and re-login therefore remain unverified against a real account. Do not put account credentials in chat; perform that acceptance check through the app after signing in securely.

The Worker has not been deployed as part of this code change. Therefore production still serves the pre-change response until an authorized deployment. A real login → profile hydration → logout → rejected request → login-again test remains pending deployment and a real test account; no credentials should be shared in chat.
