# AfuChat Discover migration record

**Feature:** Batch 1 — Discover  
**Date:** 2026-10-08  
**Starting commit:** `da88252ee661ffc136ced79cda2dc90182593ff6`  
**Status:** IN PROGRESS

## Feature inventory

| Surface / flow | Current data path | Discover disposition |
|---|---|---|
| For You and Following posts | `getAfuChatForYouFeed`, `getAfuChatFollowingFeed`, feed Worker routes; follow IDs, bookmarks, likes, replies and views use named AfuChat API helpers | Already migrated; verify the integrated response shape, privacy, refresh, paging and offline cache. |
| Feed ranking, seen state and pagination | Client scoring/diversification, SQLite `localFeed`, AsyncStorage fallback, connectivity refresh and background poller | Preserve. These are client/offline responsibilities, not Worker CRUD. |
| Video feed | `/feed/videos`; video post likes, bookmarks, follows and views use existing API helpers; replies use post API helpers | Already routed. Verify feed states, relationships, comment author data, view tracking, Realtime and offline playback/cache. |
| Trending posts/videos and hashtags | `/posts/search` and `/posts/trending/hashtags` | Already routed; verify callers and returned author metadata. |
| Suggested users | `UserRecsCard` directly queries profiles; follow state already uses `/follows/ids` and `/follows` | Replace the profile query with a fixed Discover API operation; retain its short-lived client cache and seeded selection. |
| Active people in Discover's Find tab | `FindPeopleTab` directly queries profiles; follow/follower IDs already use `/follows/ids`; `update_last_seen` is called directly | Move the active-profile read and heartbeat behind named Discover operations; retain profile Realtime and polling. |
| People directory and Nearby | `app/user-discovery.tsx` directly queries profiles, reads/writes the current profile's coordinates, and calls `nearby_users`; follows/status already use Worker routes | Move the profile directory, location update and Nearby RPC behind authenticated Discover operations. Preserve the opt-in check, current-account scoping, location permission flow, radius and Realtime reload. |
| Search people and trending people | Search screen directly queries `profiles`; posts, videos and hashtags already use Worker routes | Move only the user/profile discovery lookup needed by Discover/Search. Keep non-Discover Search domains classified below. |
| Video-reply @mention suggestions | `VideoCommentsSheet` directly queries profiles; reply reads/writes/likes already use post API routes | Replace the profile lookup with the shared Discover people-search operation; preserve replies Realtime. |
| Organization posts inserted into For You | Discover directly reads `organization_page_posts`, `organization_pages`, reply counts and current-user likes; like/unlike then directly updates the denormalized organization-post count | Add the minimum fixed feed-read operation needed for this Discover surface and route the count synchronization through the existing post-like operation. This does not complete the Organizations/Business feature. |
| Story tray in the Discover header | `StoriesRow` reads `stories` and `story_views`, hydrates account profiles, caches rows/media, and listens to story Realtime | Classify with Batch 4 — Stories. Preserve it unchanged in this batch; its viewer, privacy and lifecycle are Stories work, not Discover feed CRUD. |
| Public groups/channels in Find tab | `FindPeopleTab` reads `chats`, `chat_members`, `channels`, `channel_subscriptions`; group join inserts `chat_members` | Classify with Batch 3 — Chat / Channels. Preserve current behavior; do not partially migrate membership or channel operations during Discover. |
| Other global Search results | Search also queries events, gifts, jobs, marketplace, freelance and paid communities; its organization-page results are business data | Leave those domains for their scheduled batches. Do not turn Discover into a cross-domain Search migration. |
| `SuggestedUsers` component | Imported by Discover but not rendered there; its direct profile queries are not on the active Discover path | No Discover caller to migrate; revisit only when auditing its actual consumer feature. |

## Existing API routes to reuse

- `GET /v1/chat/feed/for-you`
- `GET /v1/chat/feed/following`
- `GET /v1/chat/feed/videos`
- `POST /v1/chat/feed/views`
- `GET /v1/chat/posts/search`
- `GET /v1/chat/posts/trending/hashtags`
- `/v1/chat/posts/{postId}`, `/like`, `/replies`, and reply likes
- `/v1/chat/bookmarks` and `/v1/chat/follows/*`

## Planned Discover API additions

- Fixed profile-discovery reads for suggested, trending, active, searched, directory and Nearby people.
- Authenticated current-user presence heartbeat and privacy-checked location update.
- A bounded, hydrated organization-post feed read for the Discover For You interleave.
- Organization-post like-count synchronization inside the existing post-like API operation.

All operations remain under `/v1/chat/*`; no generic PostgREST forwarding route or duplicate profile store is permitted. Profile hydration must use the shared `accounts.profiles` source where applicable, and identity must come from the verified AfuAuth session.

## Realtime, offline, privacy and errors

- Preserve Discover feed Realtime for post deletion, likes, replies and follow changes; preserve video/comment and active-presence subscriptions.
- Preserve SQLite and AsyncStorage feed hydration, offline pagination, reconnect refresh, video cache/offline playback, watch progress and local search history.
- Keep location permission and `location_sharing_enabled` enforcement; never accept a client-supplied user ID as authority.
- Keep feed visibility and search/profile discovery exclusions; return API errors as errors rather than silently converting them to empty results.
- The story tray and group/channel sections retain their existing Realtime and data paths until their own feature batches.

## Verification and completion gate

Pending: Worker tests, mobile typecheck/tests available in this workspace, authenticated and unauthenticated behavior, privacy/error cases, Realtime preservation, offline behavior, commit/push, `afuchat-api` deployment, deployed version check, and production verification with a normal signed-in session.
