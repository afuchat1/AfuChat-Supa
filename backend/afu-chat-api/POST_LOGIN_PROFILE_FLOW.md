# AfuChat post-login profile flow

## Findings before the fix

The working login flow already returned and persisted a shared Supabase session. Email login uses `supabase.auth.signInWithPassword`; username/phone login resolves the identifier through the existing AfuAuth API. Native sessions use the app's configured persistent storage and web sessions use browser storage. Login and session storage were not changed.

After `SIGNED_IN`, `AuthContext.fetchProfile` calls `GET https://api.afuchat.com/v1/chat/me` through `getAfuChatCurrentProfile`. The request sends `Accept: application/json` and the current Supabase bearer token; it does not send a user ID. The app rejects a response whose `id` does not match the signed-in user.

The first production probe found that `/v1/chat/me` was not deployed and returned `501`. After its handler was deployed, a secure real-account test confirmed that login succeeded (`200`) and `/v1/chat/conversations` loaded (`200`), but `/v1/chat/me` returned `404`. A read-only database check showed the authenticated identity had a matching row in the existing shared `accounts.profiles` table, with both `id` and `user_id` matching the Auth identity, but no corresponding row in `afuchat.profiles` or its `public.profiles` compatibility view. The existing account row contains all fields selected by the mobile profile shape. An authenticated PostgREST read against the `accounts` schema returned that existing row (`200`).

## Confirmed root cause and scope

There were two deployment/data-source failures in sequence: initially the deployed Worker had no `/v1/chat/me` handler; after that handler was deployed, it queried `public.profiles`, which is a view over `afuchat.profiles`. That product profile view had no row for the valid shared account, even though the canonical profile already existed in `accounts.profiles`. The login token, AfuAuth identity verification, API hostname, and account ID mapping were valid. `AuthContext.fetchProfile` falls back to cached data (or `null`) when the profile request fails, which made a successful login appear to finish without fresh profile data.

The correction is limited to the current-user route: it now reads the verified user's existing row from the shared `accounts` schema, using the same bearer token and an explicit field allowlist. Conversation RPCs and other AfuChat product-data routes continue using `public`. No row, table, database, or migration was created or changed.

## Implemented flow

1. The existing Supabase login and session persistence remain unchanged.
2. On profile hydration, the mobile app reads the current session token. If it is near expiry, the existing token helper attempts a refresh.
3. The app sends `GET https://api.afuchat.com/v1/chat/me` with `Accept: application/json` and `Authorization: Bearer <shared Supabase access token>`. It does not send a user ID.
4. The AfuChat Worker validates the bearer through its AfuAuth service binding by calling `POST /v1/auth/session`. It requires the returned access token to match the incoming bearer exactly and takes the user ID only from that verified result.
5. The Worker queries the existing shared Supabase `accounts.profiles` resource for that verified ID, forwarding the same bearer token and using the existing anon key/RLS path. It selects only the fields used by the mobile `Profile` type and returns the existing row in the same object shape expected by `AuthContext`. It does not read email or accept a client-supplied identity.
6. The mobile app checks that the returned profile ID matches the signed-in user's ID before caching and exposing it.
7. Missing/invalid sessions are rejected before the profile query. Missing rows return a generic `404`; upstream/database errors return a generic `502`/`503`. Internal logs retain request ID and status/code only; public responses omit infrastructure details.

The AfuChat/AfuAuth client API origin is pinned to `https://api.afuchat.com`; the deprecated `EXPO_PUBLIC_AFUCLOUD_API_URL` and `EXPO_PUBLIC_AFUCHAT_API_URL` overrides are ignored. The current-user endpoint is exactly `GET /v1/chat/me`. Username/phone identifier resolution remains on AfuAuth's `/v1/auth/resolve-identifier`; the working login flow was not changed.

Subscription, equipped-goods, and login-time account-deletion checks retain their existing direct Supabase SDK calls. They were not moved by this profile-route fix.

A separate direct probe of AfuAuth's `GET /v1/auth/me` returned `503`; AfuChat does not call that route. AfuChat's required `POST /v1/auth/session` identity-verification call succeeds, and the current-profile endpoint reads the account row with the authenticated bearer. AfuAuth login code and other product APIs were left unchanged.

## Verification status

### Production deployment

On 2026-10-07, `backend/afu-chat-api/deploy.mjs --apply` deployed the current Worker to the existing `afuchat-api` script. It preserved the existing `api.afuchat.com/v1/chat/*` route, `AFUAUTH_API` service binding, and `afuchat-media` bucket binding. No other product Worker, route, or database was changed. The first deployment attempt was rolled back because postflight checked the old response during edge propagation; readiness now waits for `/v1/chat/me` to return the expected unauthenticated `401`. After the real-account test exposed the profile-schema mismatch, the corrected `accounts`-schema lookup was deployed separately. The final deployment passed all configured postflight checks.

### Endpoint inventory and checks

All AfuChat client API calls use the pinned `https://api.afuchat.com` origin. The app's current API call inventory and production status are:

| Endpoint group | Production verification |
|---|---|
| `GET /v1/chat/healthz`, `GET|POST /v1/chat/status` | `200`; status reports `ok: true` |
| `GET /v1/chat/me` | No bearer: `401`; invalid bearer: `401`; fresh, refreshed, restored, and re-login sessions: `200`, with the authenticated ID and mobile profile shape verified |
| `GET /v1/chat/conversations` | No bearer: `401`; authenticated fresh, restored, and re-login sessions: `200` with an array response; unit tests verify shared-session identity and the same bearer reaches Supabase RLS |
| `POST /v1/chat/support/ai-reply`, `/v1/chat/push/register`, `/v1/chat/push/send` | No bearer: `401`; unit tests cover validation, identity derivation, and sanitized failures |
| `POST /v1/chat/account/export`, `/v1/chat/payments/pesapal-initiate` | No bearer: `401`; account export and payment validation have Worker unit coverage |
| Pesapal callback/IPN routes | Included in the deployed Worker; no live transaction or payment-provider callback was triggered |
| `/v1/chat/storage/*` | Deployed through the canonical chat router to the preserved legacy media handler and existing `afuchat-media` bucket; router and mapping tests pass |
| `/v1/chat/videos` and `/v1/chat/videos/*` | Route is present but intentionally returns `501` while the server-side video processing pipeline is unavailable. The app keeps the source-video fallback; this is a known limitation, not part of profile hydration. |

The AfuAuth health route remains healthy at `/v1/auth/healthz`. The AfuChat Worker validates session tokens through its `AFUAUTH_API` service binding; that internal `POST /v1/auth/session` call is not a public AfuChat route. No old Worker hostname or `afucloud-api` user-data route was found in the AfuChat client API call sites.

### Real-account verification

The production checks used a temporary test session; no credentials or profile values were printed or written to the repository.

- Fresh login succeeded (`200`). The authenticated `GET /v1/chat/me` response was `200`, its `id` matched the verified Auth identity, and all expected mobile profile fields were present. Authenticated conversations returned `200` with an array.
- Supabase refresh-token exchange succeeded (`200`); the refreshed session again loaded `/v1/chat/me` and conversations successfully.
- In the running web app, login reached `/chats` with a persisted session and no error boundary. Reloading restored that localStorage session; the app again received `200` responses from `/v1/chat/me` and `/v1/chat/conversations`.
- Logout through Supabase returned `204`; the browser session was removed and the app returned to `/login`. A protected profile request with no bearer returned `401`.
- Re-login after logout again reached `/chats`; `/v1/chat/me` and conversations both returned `200`. The second temporary session was also logged out.
- The Worker unit suite passes all 31 tests. The mobile TypeScript check passes with TypeScript 6.0.3 and `--ignoreDeprecations 6.0`. The static web export and `Start application` workflow start successfully.

This verifies the web client's persisted-session restore. A native Android runtime session was not exercised. The configured `EAS AAB Build` workflow is separately failed because its EAS identity is not authorized to read the existing Expo app; no EAS account or project configuration was changed.

### Remaining unrelated limitations

- `GET /v1/chat/videos` and `/v1/chat/videos/*` are routed but return `501` while the server-side video-processing pipeline is unavailable; the mobile client retains its source-video fallback.
- A separate probe of AfuAuth's `GET /v1/auth/me` returned `503`. AfuChat does not call that route: its identity verification uses `POST /v1/auth/session`, which succeeds. AfuAuth login and other product APIs were not changed.
