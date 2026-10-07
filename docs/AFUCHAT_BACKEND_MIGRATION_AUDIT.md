# AfuChat backend migration audit

Audit date: 2026-10-07. Catalog queries were read-only. No database rows,
schemas, buckets, CDN routes, or deployed Workers were changed.

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
posts/owner delete/likes/replies, support AI reply, push registration/send,
account export, Pesapal payments, and the existing storage handler. Video
processing paths remain explicit `501` stubs. AfuAuth and AfuAI calls remain
separate product APIs.

The bookmark and post routes are implemented in source and tested locally, but
have not been deployed. The post route slice uses fixed projections, derives
author identity from AfuAuth, forwards the same user token to PostgREST, and
uses the `accounts.profiles` schema for author details. Post feeds, view
tracking, mention search, and other product data remain unmigrated.

## Mobile source inventory

Before the bookmark migration, the mobile app had 723 literal `.from(...)`
call sites over 92 relation names in 99 files. After moving saved-post list,
detail, discover/video feed, and offline-queue bookmark operations to the
Worker, the current source has:

- 706 direct `.from(...)` call sites over 89 relation names in 98 files.
- 89 direct RPC call sites over 36 function names.
- 46 Supabase Auth call sites and 30 Realtime channel construction sites.
- No remaining direct `.from("bookmarks")`, `.from("saved_posts")`, or
  `.from("post_bookmarks")` calls in the mobile source.

Shared Supabase Auth and Realtime are intentionally retained. The other direct
PostgREST calls and RPCs are not yet migrated; this is not an app-wide
completion claim.

### Current direct relation names

`acoin_transactions`, `advanced_feature_settings`, `blocked_users`, `blocks`,
`business_verification_requests`, `channel_subscriptions`, `channels`,
`chat_drafts`, `chat_members`, `chat_mutes`, `chat_preferences`, `chats`,
`community_members`, `conversations`, `crash_logs`, `currency_settings`,
`device_sessions`, `digital_events`, `follows`, `freelance_listings`,
`freelance_orders`, `freelance_reviews`, `gift_marketplace`, `gift_statistics`,
`gift_transactions`, `gifts`, `life_earth_leaderboard`, `life_earth_saves`,
`match_matches`, `match_messages`, `match_photos`, `match_preferences`,
`match_profiles`, `match_reports`, `match_swipes`, `message_edit_history`,
`message_reactions`, `message_reports`, `message_status`, `messages`,
`money_requests`, `music_purchases`, `music_tracks`, `notification_events`,
`orders`, `org_page_jobs`, `org_verification_requests`,
`organization_page_connections`, `organization_page_followers`,
`organization_page_posts`, `organization_pages`, `owned_usernames`,
`paid_communities`, `post_acknowledgments`, `post_images`, `post_replies`,
`post_reply_likes`, `post_views`, `posts`, `profiles`, `red_envelope_claims`,
`red_envelopes`, `security_preferences`, `seller_applications`,
`shop_order_items`, `shop_order_messages`, `shop_orders`, `shop_products`,
`shop_reviews`, `shopping_cart`, `shops`, `starred_messages`,
`status_goods_purchases`, `stories`, `story_likes`, `story_replies`,
`story_views`, `subscription_plans`, `support_messages`, `support_tickets`,
`user_activity_events`, `user_gifts`, `user_reports`, `user_subscriptions`,
`username_featured_listings`, `username_listings`, `video_assets`,
`video_watch_history`, `xp_transfers`.

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
`lookup_profile_by_afu_id`, `nearby_users`, `place_username_bid`,
`purchase_music_track`, `purchase_status_good`, `purchase_username`,
`reward_activity_xp`, `send_afu_ai_welcome`, `update_last_seen`,
`upsert_watch_history`.

All 36 called functions exist in `public` and are `SECURITY DEFINER`. Their
arguments and authorization behavior must be reviewed one by one before adding
Worker routes; forwarding arbitrary function names or caller-supplied user IDs
would cross the shared product boundary.

## Live catalog cross-check

The read-only Supabase Management API catalog query returned 201 base tables in
`afuchat`, 201 views in `public`, 23 base tables in `accounts`, 24 in `chat`,
and 30 in `social`. It confirmed:

- 85 of the app's 89 current literal relation names resolve in the catalog.
- 84 are in `public`; `orders` exists as `shop.orders` and is not a
  `public.orders` relation.
- Four names used directly by the app are absent from all inspected schemas:
  `blocks`, `business_verification_requests`, `life_earth_leaderboard`, and
  `org_page_jobs`.
- The mobile app still calls all 36 RPCs in `public`; all 36 are
  `SECURITY DEFINER`.

Do not add tables to make the stale names work. Map them to the current product
relations/API only after inspecting their existing use and data semantics.
Do not expose `afuchat` through PostgREST, bulk-copy divergent schemas, or
change shared schema grants as a shortcut.

## Remaining work

The current request is broader than the bookmark route. Migrate the remaining
client operations by product-owned domain, preserving response shapes,
identity-derived ownership, RLS, optimistic rollback, realtime freshness, and
offline retry behavior. The highest-risk unresolved cases include:

- Chat messages, membership, delivery/read state, and existing SQLite sync.
- Posts/feed/comments/follows/stories and their realtime subscriptions.
- Wallet, ACoin, XP, purchases, subscriptions, and marketplace operations.
- Shop/business orders, organization pages/jobs, support, match, and music.
- The four absent relation names and the `shop.orders` schema mismatch.

Keep each route narrowly scoped and add authenticated Worker tests before
switching its mobile callers. Deploying the Worker or shipping mobile builds
requires a separate explicit production approval and an authenticated
end-to-end verification plan.
