# AfuChat existing-schema integration audit

**Audit date:** 2026-10-10  
**Scope:** Integrate the mobile app and AfuChat API with the existing production database contract. No database schema changes or deployment were authorized.

## Summary

There is no `shop` schema. Commerce tables such as `shops`, `shop_products`, `shop_orders`, and `shop_order_items` are relations in `afuchat`. The previous `orders -> shop` routing was stale and has been removed. Shared profile and verification-request records are explicit `accounts` relations; they are not shop data.

The app’s shop reads, account-verification route, home banner query, and job-listing references were adjusted to the live contract. Queries that depended on nonexistent foreign keys now load related rows separately. Unsupported features fail visibly or remain unavailable instead of substituting sample records. Since no atomic ACoin transaction operation exists, shop checkout, escrow release, and refunds now fail before any balance or order write.

The audit also found missing database routines and an unresolved ACoin transaction-safety gap. Those are documented below and were not worked around with unsafe writes or schema changes.

## Method and safety

- Inspected live relation, column, foreign-key, and routine metadata for the app’s configured production project.
- Scanned 401 TypeScript/JavaScript source files for literal relation references, covering 76 distinct `.from(...)` relation names; checked the Worker’s 138-name AfuChat relation allowlist against the live catalog.
- Scanned mobile `.rpc(...)` calls against live routines.
- Did not read or modify application rows. No DDL, migration, data mutation, or deployment was performed.
- Restored already-declared dependencies with `pnpm install --frozen-lockfile`; package manifests, lockfile, and `.replit` were unchanged.

## Confirmed schema routing

| Data | Live location | Integration rule |
|---|---|---|
| AfuChat application and commerce records | `afuchat` | Keep requests on the AfuChat gateway and preserve the signed-in user’s bearer token/RLS. |
| Shared user profiles | `accounts.profiles` | Treat as an explicit shared-account relation, not a shop schema. |
| Business verification requests | `accounts.verification_requests` | Reuse the existing relation and only its confirmed columns. |
| Store, product, cart, order, order-item, message, and review relations | `afuchat` | No schema named `shop`; remove stale `orders -> shop` routing. |

### Commerce columns and relationships

- `shop_orders` has `delivery_note`, not `delivery_address` or `notes`; valid order states are `pending`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, and `refunded`.
- `shop_order_items` exposes `quantity`, `unit_price_acoin`, `snapshot_name`, and `snapshot_image`. It has no declared foreign keys to orders or products.
- `shop_orders.buyer_id` and `seller_id`, `shops.seller_id`, and `shop_products.seller_id` have confirmed profile relationships. The profile joins route to `accounts`.
- There is no declared FK for `shop_orders.shop_id`, `shop_products.shop_id`, `shopping_cart.product_id`, or the `shop_order_items` order/product IDs. Those relations must not be embedded as PostgREST FK joins; the app now loads and joins those records explicitly.

## Changes made

- Removed the nonexistent `shop` schema mapping from both the mobile client and Worker gateway. Shop/order relations route through `afuchat`; `profiles` and `verification_requests` use their confirmed `accounts` location.
- Removed a stale profile-join mapping and updated gateway/schema contract tests for the live routes and real commerce FKs.
- Updated shop cart, product, order, and order-management reads to use confirmed fields and separate batch lookups where no FK exists. Order item display uses the stored snapshot fields.
- Updated business verification to use `accounts.verification_requests` and its available fields.
- Removed the nonexistent `app_banners` query while retaining supported banner content.
- Removed reads/writes to the absent `org_page_jobs` relation. The search surface reports jobs as unavailable rather than returning invented listings.
- Blocked shop checkout, escrow release, and refunds before any database write until an atomic settlement API exists. The buyer-facing release action explains that balances and order status will not change; browsing, cart management, order history, and order messages remain available.
- Made tests explicitly verify that nearby discovery and presence fail closed when the required production routines are absent.

## Unresolved production contract gaps

### Missing mobile RPCs

Only `get_or_create_direct_chat(other_user_id uuid)` was confirmed among the 35 distinct mobile RPC calls audited. These 34 names have no matching live routine:

```text
add_group_members
award_xp
cancel_my_subscription
chat_has_screenshot_protection
check_mutual_match
check_public_chat_username
check_username_availability
claim_red_envelope
claim_username
clear_afuai_chat
convert_gift_to_acoin
count_my_channels
count_my_groups
create_channel_chat
create_group_chat
create_red_envelope
credit_acoin
deduct_acoin
delist_username_listing
feature_username_listing
get_channel_access_context
get_my_channels
increment_channel_subscriber
insert_afuai_message
lookup_profile_by_afu_id
place_username_bid
purchase_music_track
purchase_status_good
purchase_username
reward_activity_xp
send_afu_ai_welcome
update_last_seen
upsert_watch_history
```

Do not replace these with fabricated success responses or direct balance writes. Each feature needs an existing supported API path or a separately authorized database contract change.

The Worker’s nearby-discovery route also expects `nearby_users`, which is absent. Its nearby and presence flows now fail closed in tests rather than claiming success.

### ACoin transaction safety

`credit_acoin` and `deduct_acoin` are absent. Even if individual balance routines were available, a balance change followed by separate order/item/escrow writes would still not be one atomic transaction. The app now blocks shop checkout, release, and refund operations before any writes. Existing orders remain readable, but settlement cannot proceed through this client until one atomic production operation is available. No automatic refund or order-state change was made.

### Unsupported relations

- `app_banners`, `business_verification_requests`, and `org_page_jobs` are not present in the live relation catalog.
- Business verification was redirected to the existing account relation; fields absent from its schema are not added.
- Job listings are unavailable until a supported source is identified.

## Verification

- `cd artifacts/mobile && pnpm run typecheck` — passed.
- `cd artifacts/mobile && pnpm run build:web` — passed; generated the static web export.
- `node --experimental-strip-types --test backend/afu-chat-api/test/*.test.mjs` — 105 passed, 0 failed. Missing nearby/presence database routines are tested as fail-closed.
- `git diff --check` — passed.
- Restarted the `Start application` workflow; static web preview served on port 5000 and the public language-selection screen rendered.
- Signed-in mobile screens and live user-session queries were not verified in the preview.

## Recommended next decisions

1. Identify supported API operations for the 34 missing RPCs before re-enabling affected actions.
2. Do not enable ACoin shop transactions until their balance and order writes can be made atomic.
3. Decide whether nearby discovery and presence should be implemented from existing data or remain unavailable.
