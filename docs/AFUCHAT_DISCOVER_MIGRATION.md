# AfuChat Discover migration record

**Batch:** Discover — People Discovery + Suggested People
**Date:** 2026-10-08  
**Starting commit:** `521b8c054abd34f512e3d52043bfc41efe137728`
**Status:** Local verification passed; production deployment pending

## Scope

This batch covers only active/recent people in Discover's Find tab and the suggested-people cards. The For You feed itself, profiles as a global domain, global search, groups/channels, Stories, and other product areas remain outside scope.

## Data flow and safeguards

- Active people: `GET /v1/chat/discover/people?mode=active`; requires the shared AfuAuth session and checks the optional expected account ID.
- Suggested people: `GET /v1/chat/discover/people?mode=suggested`; candidates are public, exclude the current account and already-followed accounts, and respect onboarding, banned/deleted, and search-visibility filters.
- Follow state: `GET /v1/chat/follows/ids` for the signed-in account's following and follower IDs. Follow/unfollow uses the existing `/v1/chat/follows` route; no second follow API was added.
- Presence: `POST /v1/chat/discover/presence`; the Worker verifies the shared bearer and invokes the named `update_last_seen` operation for that verified account.
- Active presence respects `show_online_status`: a user who hides it can remain discoverable, but their `last_seen` is returned as `null`.
- Profile hydration continues through the shared `accounts.profiles` relation for authenticated results. No schema exposure, data copy, or database migration was made.

## Mobile behavior

- `FindPeopleTab` keeps search/filtering local, preserves loading/error/empty states, and rolls back optimistic follow changes on failure.
- `UserRecsCard` uses the existing suggestion and follow helpers, supports follow/unfollow with a busy state and rollback, and caches even a successful empty result for five minutes. Failed requests remain retryable and are not cached as empty results.
- Presence sends one heartbeat per minute, has a one-minute polling fallback, coalesces profile Realtime refresh bursts, and clears timers/subscriptions on unmount.
- Groups/channels retain their existing direct Supabase path and are not migrated in this batch.

## Direct Supabase boundary

In `FindPeopleTab.tsx` and `UserRecsCard.tsx`, before and after this batch:

- Direct `.from()` call sites: **5 → 5**, all for public group/channel discovery, membership/subscription state, or joining a group.
- Direct `.rpc()` call sites: **0 → 0**. Presence now goes through the AfuChat Worker route.
- Profile and follow data for these people cards use named AfuChat routes. The existing profile Realtime subscription remains in place.

## Verification

The focused Worker tests cover authenticated active discovery, suggested-account filtering, following/follower ID responses, presence ownership, unauthenticated rejection, hidden-presence redaction, and sanitized API failures. Existing follow mutation tests cover server-side follow/unfollow authorization. Mobile typecheck covers the UI and API helpers.

## Deployment safety

- The first `afuchat-api` apply was automatically rolled back after postflight received HTTP 501 from `GET /v1/chat/posts/mine`. The rollback was confirmed.
- After rollback, production returned 200 for health/status, 401 for `/me`, and 501 for `/posts/mine`, active Discover people, and Discover presence.
- The original readiness check treated `/me` returning 401 as proof that the new Worker was live, but that response also came from the restored old Worker. The deploy script now waits for `GET /v1/chat/discover/people?mode=active` to return 401 before running the remaining postflight checks. No smoke assertions were removed or weakened.

## Remaining Discover batches — not started

1. Public groups + public channels
2. For You feed
3. Following feed
4. Discover post interactions
5. Discover pagination/cache/offline behavior

**Next batch:** Public groups + public channels. Do not start until instructed.
