# Supabase schema comparison and alignment

**Audit date:** 2026-10-10  
**Reference:** the old working project was queried read-only.  
**Target:** the new project received additive schema corrections; no IDs or
relationship columns were rewritten.

## Summary

The new project already contains the mobile app's routed tables, but its
relationship metadata and several sequence defaults did not match the old
project. The API already routes mobile PostgREST table and RPC traffic through
the AfuChat Worker; its resource mapping needed to be documented against the
actual split between `accounts.profiles` and `afuchat.profiles`.

The following corrections have been applied to the new project:

- Restored 83 legacy foreign keys after confirming that every current child
  value resolves to the expected referenced primary/unique key.
- Validated the existing `chat_members.user_id` and `chats.created_by`
  references to `afuchat.profiles`.
- Restored 13 sequence-backed column defaults, synchronizing each sequence to
  at least the highest existing target ID before enabling generated IDs.
- Restored `afuchat.developer_applications.status` using the existing
  `afuchat.developer_status` enum. The existing target application ID matched
  the old project, so its original status value was copied and verified.
- Added an API contract test that checks every literal mobile `.from(...)`
  relation against the Worker allowlist.

No application rows were added or deleted, and no IDs were changed. The one
existing developer-application row received its missing status value. No Worker
deployment or app release was performed.

## Structure counts

| Catalog | Old reference (`public`) | New target after correction |
|---|---:|---:|
| Tables | 201 | 237 across `accounts` (23), `afuchat` (201), and `afucloud` (13) |
| Views | 3 | 0 in those application schemas |
| Foreign keys | 328 | 348 |
| Primary keys | 201 | 237 |
| Unique constraints | 94 | 116 |
| Check constraints | 115 | 130 |
| Non-internal triggers | 52 | 0 |
| Routines | 236 | 8 |

The old routine count includes all routines in its `public` schema, not just
mobile RPCs. The target has two unvalidated foreign keys remaining. The four
foreign keys originally unvalidated on chat/profile data were not redirected:
two now validate against `afuchat.profiles`; two remain unvalidated because
existing rows do not all have a matching `afuchat.profiles` row.

### Relations present on only one side

Old-only public relations:

- `life_earth_leaderboard`
- `public_profiles`
- `referral_stats`

New-only relations that were preserved:

- `activity_logs`, `api_keys`, `billing_subscriptions`,
  `cloudflare_connections`, `domains`, `hostnames`, `images`,
  `personal_tokens`, `projects`, `refresh_tokens`, `storage_containers`,
  `storage_objects`, `user_locations`, `user_preferences`, `webhooks`

## Profile tables and relationships

`accounts.profiles` and `afuchat.profiles` are both live and remain separate:

| Measure | Result |
|---|---:|
| `accounts.profiles` rows | 342 |
| `afuchat.profiles` rows | 319 |
| IDs present in both | 307 |
| Accounts-only IDs | 35 |
| AfuChat-only IDs | 12 |
| Account rows where `id` differs from `user_id` | 8 |

For the 307 shared IDs, `handle`, `display_name`, and `avatar_url` match. These
differences make a merge or ID rewrite unsafe.

Current profile routing is relationship-specific:

- The mobile root `profiles` resource and `/v1/chat/me` use
  `accounts.profiles`.
- `verification_requests` uses `accounts`.
- Same-schema chat/profile relationships whose foreign keys point to
  `afuchat.profiles` remain in `afuchat`.
- Cross-schema profile joins to `accounts.profiles` are handled by the API's
  explicit profile-join bridge.
- `/v1/chat/profiles/{id}` continues to read the AfuChat product profile.

Important row-reference counts explain why the chat foreign keys were kept on
`afuchat.profiles`:

| Reference | Rows | Match `accounts.profiles` | Match `afuchat.profiles` |
|---|---:|---:|---:|
| `chat_members.user_id` | 629 | 409 | 629 |
| Non-null `chats.created_by` | 336 | 249 | 336 |
| `messages.sender_id` | 3,082 | 1,126 | 3,080 |
| `message_status.user_id` | 3,084 | 1,008 | 2,645 |

The two rows missing a sender profile and the 439 message-status rows missing a
profile are why those two constraints remain unvalidated. They were not
rewritten or deleted.

`username_featured_listings.listing_id` currently references
`accounts.username_listings`, while the mobile API's `username_listings`
resource routes to `afuchat`. There is one featured row; its listing ID resolves
in both schemas, and the listing tables share 45 IDs. The existing foreign key
was preserved rather than adding a second potentially ambiguous PostgREST
relationship.

## Applied migrations

The SQL is checked into the repository and was applied only to the new project:

- `backend/afu-chat-api/migrations/20261010_restore_verified_relationships.sql`
  — restores the 83 verified foreign keys and validates the two clean existing
  chat/profile foreign keys.
- `backend/afu-chat-api/migrations/20261010_restore_legacy_sequence_defaults.sql`
  — restores generated-ID defaults for the 12 Engagera ID columns and
  `support_tickets.ticket_number`. Each sequence was advanced to at least its
  table's current maximum before its default was enabled.
- `backend/afu-chat-api/migrations/20261010_restore_developer_application_status.sql`
  — restores the missing status column with the original enum and `pending`
  default; the matching existing row's old status was copied separately and
  verified.

Sequence defaults were intentionally not added to columns where the old
project itself had no default.

## Mobile and API data flow

The mobile client routes all PostgREST table and RPC requests through
`/v1/chat/data/*`; the API forwards the signed-in user's bearer token so the
existing grants and row-level security remain in force. A static source check
found 76 literal mobile `.from(...)` relation names, all registered by the API
schema contract.

Supabase Auth and Realtime still use the shared Supabase client directly. They
were not rewritten as part of the PostgREST schema alignment, preserving the
existing login/session and realtime behavior. No direct mobile `/rest/v1`
request was found outside the configured PostgREST gateway.

## Remaining compatibility gaps

- The old project has 52 non-internal triggers; the new project has none.
  Trigger-driven behavior such as counters, timestamps, and notifications is
  therefore not fully reproduced.
- Of the 35 distinct mobile RPC names audited in the existing integration
  audit, 34 remain absent from the target. The complete list is in
  `docs/AFUCHAT_EXISTING_SCHEMA_INTEGRATION_AUDIT.md`.
- These RPCs and trigger bodies have not been copied. Some functions perform
  balance changes or privileged operations; recreating them without checking
  their `SECURITY DEFINER` behavior, ownership checks, and transaction
  boundaries could enable unauthorized writes.

## Verification and release status

- Read-only comparison of the old project completed; no old-project DDL or row
  writes were issued.
- New-project checks confirmed 348 foreign keys total, with only the two
  documented message/profile constraints unvalidated.
- All 13 sequence defaults are present and point to their intended sequences.
- The developer-application status column and matching row value were verified.
- Key table counts remained unchanged: profiles 342/319, chats 337,
  chat-members 629, messages 3,082, posts 237, post images 135, and post
  replies 325.
- The mobile/API contract tests and app typecheck/web build are the remaining
  local checks for this change set.
- Signed-in end-to-end verification with an existing user has not been run in
  this session because no authenticated existing-user session is available.
  Do not release until an existing user's login, profile, feed, chat, and
  interaction flows are verified against the corrected target.
