# AfuChat backend migration audit

Audit date: 2026-10-08. The mobile source inventory was refreshed after the
follow and discover-feed migration. Catalog queries were read-only; no database
rows, schemas, buckets, or CDN routes were changed.

## Target boundaries

- AfuChat-owned product data operations use named `https://api.afuchat.com/v1/chat/*`
  routes. Do not add a generic PostgREST proxy or a catch-all `/v1/*` route.
- AfuAuth continues to own `/v1/auth/*` and the shared Supabase identity.
- AfuAI continues to own `/v1/ai/*`. Other Afu products and their Workers,
  schemas, APIs, and buckets are outside this migration.
- Keep the current shared Supabase bearer token. API routes verify it through
  AfuAuth and forward the same token when row-level policies must apply.
- Keep Supabase Realtime as the current transport for live events and the
  SQLite offline queue as the durable retry layer until each flow is migrated.
- Keep media bytes on the existing AfuChat storage API and
  `cdn.afuchat.com/chat/*`; this data migration does not move objects or change
  the CDN/bucket boundary.

## Current Worker coverage

The `afuchat-api` source currently owns health/status, current-account profile
read, conversation list, saved-post/bookmark operations, post create/detail/my
posts/owner delete/likes/replies, follows, discover feeds, people directory and
nearby search, post-view batches, support AI reply, push registration/send,
account export, Pesapal payments, and the existing storage handler. Video
processing paths remain explicit `501` stubs. AfuAuth and AfuAI calls remain
separate product APIs.

The bookmark, post, follow, feed, and view routes use fixed projections and
derive acting-user identity from the AfuAuth-verified shared session. The
original Supabase bearer token is forwarded where row-level policies apply.
Account profile hydration uses the `accounts.profiles` schema.

## Relationship batch 1 rollout

Before deployment, production health/status returned `200`, but the protected
follow operations and the directory/nearby routes returned the generic `501`
endpoint-unavailable response. The active `afuchat-api` bundle did not contain
the current follow/discover handlers. This was a stale Worker deployment, not a
missing mobile token or a separate login problem.

Deployed only the existing `afuchat-api` Worker. Its canonical
`api.afuchat.com/v1/chat/*` route remained in place, the existing legacy media
handler was preserved, and the `afuchat-media` bucket binding was unchanged.
No database rows, schema, other product Worker, or CDN route was changed.

Post-deployment verification passed: production health/status returned `200`;
unauthenticated follow summary/list/IDs/status, follow create/delete, people
directory, and nearby requests returned `401`; directory and nearby CORS
preflights returned `204`. The Worker postflight also passed its existing chat,
AfuAuth, storage, and media-routing checks. The authenticated response shapes
were verified with local Worker tests using a mocked shared session; no live
signed-in account was used for this batch.

## Mobile source inventory

The current source scan covered JavaScript and TypeScript files under
`artifacts/mobile`. It found:

- 550 literal `.from("relation")` call sites over 81 relation names in 106 files.
- 87 direct RPC call sites over 35 function names in 35 files.
- No remaining direct `.from("bookmarks")`, `.from("saved_posts")`, or
  `.from("post_bookmarks")` calls in the mobile source.
- No remaining direct `.from("follows")` calls in mobile `app`, `components`,
  or `modules`; follow states/counts and profile, discovery, contact, chat
  setup, sharing, video follow status, and suggested-user paths use named
  Worker routes.
- The user-discovery directory and nearby lists use
  `/v1/chat/discover/people` and `/v1/chat/discover/nearby`; the client no
  longer reads relationship counts from `profiles` or invokes `nearby_users`
  directly. The existing RPC is called server-side by the nearby API.
- Discover For You/Following feed reads and batched post-view writes use
  `/v1/chat/feed/*`.

Shared Supabase Auth and Realtime are intentionally retained. The other direct
PostgREST calls and RPCs are not yet migrated; this is not an app-wide
completion claim.

### Current direct relation names

`acoin_transactions`, `advanced_feature_settings`, `app_banners`, `app_settings`,
`blocked_users`, `blocks`, `business_verification_requests`,
`channel_subscriptions`, `channels`, `chat_drafts`, `chat_members`, `chat_mutes`,
`chat_preferences`, `chats`, `collections`, `community_members`, `conversations`,
`crash_logs`, `currency_settings`, `device_sessions`, `digital_events`,
`freelance_listings`,
`freelance_orders`, `freelance_reviews`, `gift_marketplace`, `gift_statistics`,
`gift_transactions`, `gifts`, `life_earth_leaderboard`, `life_earth_saves`,
`match_matches`, `match_messages`, `match_photos`, `match_preferences`,
`match_profiles`, `match_reports`, `match_swipes`, `messages`, `money_requests`,
`music_purchases`, `music_tracks`, `notification_events`, `orders`, `org_page_jobs`,
`org_verification_requests`,
`organization_page_connections`, `organization_page_followers`,
`organization_page_posts`, `organization_pages`, `owned_usernames`,
`paid_communities`, `post_acknowledgments`, `post_replies`, `post_reply_likes`,
`post_views`, `posts`, `profiles`, `red_envelope_claims`,
`red_envelopes`, `security_preferences`, `seller_applications`,
`shop_order_items`, `shop_order_messages`, `shop_orders`, `shop_products`,
`shop_reviews`, `shopping_cart`, `shops`, `status_goods_purchases`, `stories`,
`story_likes`, `story_replies`,
`story_views`, `subscription_plans`, `support_messages`, `support_tickets`,
`user_activity_events`, `user_gifts`, `user_reports`, `user_subscriptions`,
`username_featured_listings`, `username_listings`, `video_watch_history`,
`xp_transfers`.

### Current direct RPC names

`add_group_members`, `award_xp`, `cancel_my_subscription`,
`chat_has_screenshot_protection`, `check_mutual_match`,
`check_public_chat_username`, `check_username_availability`,
`claim_red_envelope`, `claim_username`, `clear_afuai_chat`,
`convert_gift_to_acoin`, `count_my_channels`, `count_my_groups`,
`create_channel_chat`, `create_group_chat`, `create_red_envelope`,
`create_username_listing`, `credit_acoin`, `deduct_acoin`,
`delist_username_listing`, `feature_username_listing`,
`get_channel_access_context`, `get_my_channels`, `get_or_create_direct_chat`,
`increment_channel_subscriber`, `insert_afuai_message`,
`lookup_profile_by_afu_id`, `place_username_bid`,
`purchase_music_track`, `purchase_status_good`, `purchase_username`,
`reward_activity_xp`, `send_afu_ai_welcome`, `update_last_seen`,
`upsert_watch_history`.

All 35 functions still called directly by the mobile client exist in `public`
and are `SECURITY DEFINER`. Their arguments and authorization behavior must be
reviewed one by one before adding Worker routes; forwarding arbitrary function
names or caller-supplied user IDs would cross the shared product boundary.

## Previous live catalog cross-check

The read-only Supabase Management API catalog query on 2026-10-07 returned 201
base tables in `afuchat`, 201 views in `public`, 23 base tables in `accounts`,
24 in `chat`, and 30 in `social`. It covered the then-current set of 89 mobile
relation names, not the refreshed 84-name set above. It confirmed:

- 85 of those 89 relation names resolve in the catalog.
- 84 are in `public`; `orders` exists as `shop.orders` and is not a
  `public.orders` relation.
- Four names used directly by the app are absent from all inspected schemas:
  `blocks`, `business_verification_requests`, `life_earth_leaderboard`, and
  `org_page_jobs`.
- Those four names remain in the current source inventory. The current
  `app_banners`, `app_settings`, and `collections` references were not part of
  that catalog cross-check.
- All 36 RPC names in the previous source inventory existed in `public` and
  were `SECURITY DEFINER`; `nearby_users` is now invoked server-side by
  `/v1/chat/discover/nearby` instead of from the mobile client.

Do not add tables to make the stale names work. Map them to the current product
relations/API only after inspecting their existing use and data semantics.
Do not expose `afuchat` through PostgREST, bulk-copy divergent schemas, or
change shared schema grants as a shortcut.

## Canonical-schema migration preflight (2026-10-08)

A fresh, read-only Supabase Management API inspection confirmed the following
production state:

- `chat.chats` and `afuchat.chats` each contain 337 rows with identical ID
  sets. No chat-parent rows need copying for this table.
- `chat.chat_members` has 622 rows and `afuchat.chat_members` has 629. There
  are 216 legacy membership pairs absent from AfuChat and 223 AfuChat-only
  pairs. Every legacy-only pair has an `id` already used by a different
  `afuchat.chat_members` row, so copying those rows while preserving IDs would
  collide with canonical records.
- `chat.messages` has 3,101 rows and `afuchat.messages` has 3,082. There are
  21 legacy-only message IDs and two AfuChat-only IDs. Of the legacy-only
  messages, 18 have plaintext but no encrypted content; the other three have
  ciphertext but no `sent_at`, which prevents a safe field-compatible insert.
  Among shared message IDs, 1,956 have different sender IDs. Do not overwrite
  AfuChat rows or convert plaintext into ciphertext.
- `chat.message_status` has 2,645 rows and `afuchat.message_status` has 3,084.
  There are 1,772 legacy-only `(message_id,user_id)` pairs, and every such
  pair's `id` is already used by a different canonical status row.
- Two `platform.notification_events` rows reference messages that do not
  exist in `afuchat.messages`.
- Thirty-one foreign-key constraints outside the `chat` schema still target
  `chat.*`, including constraints in `afuchat`, `accounts`, `match`,
  `platform`, `rewards`, and `shop`. Thirty-two `public` functions mention
  `chat.*`; these include AfuChat routines and shared-product routines that
  need individual ownership and authorization review before editing.
- The existing API message and membership routes still read both the public
  AfuChat-backed relations and the legacy `chat` schema. Removing that fallback
  now would hide the unresolved legacy-only rows.

This means the attached no-replacement-IDs and no-overwrite rules currently
prevent a complete row merge for memberships and read statuses. The three
ciphertext message rows also cannot be copied without resolving missing
timestamps, and the two notification references need an explicit disposition.
No live schema, rows, function, grant, Worker, or API setting was changed during
this preflight. Do not cut over reads/writes or drop `chat` until these conflicts
and all 31 FK / 32 function dependencies are resolved and reverified.

## Remaining work

Continue migrating client operations by product-owned domain, preserving
response shapes, identity-derived ownership, RLS, optimistic rollback, realtime
freshness, and offline retry behavior. The highest-risk unresolved cases
include:

- Chat messages, membership, delivery/read state, and existing SQLite sync.
- Video-specific likes/replies and remaining post surfaces, stories, and their
  realtime subscriptions. Core discover feeds, follows, and post-view batches
  now have named Worker routes.
- Wallet, ACoin, XP, purchases, subscriptions, and marketplace operations.
- Shop/business orders, organization pages/jobs, support, match, and music.
- The four absent relation names and the `shop.orders` schema mismatch.

Keep each route narrowly scoped and add authenticated Worker tests before
switching its mobile callers. Any authenticated end-to-end production test
requires a normal signed-in session; never substitute a development identity or
service-role credential for a user's session.
