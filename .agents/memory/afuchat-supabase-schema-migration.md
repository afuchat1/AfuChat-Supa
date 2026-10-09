---
name: AfuChat Supabase schema migration
description: Runtime schema ownership and safe routing for AfuChat data through Supabase PostgREST.
---

`afuchat` is the canonical runtime schema for AfuChat-owned relation reads and writes. PostgREST must expose it first so the Supabase client defaults to it. No rows, tables, or RLS policies should be moved, copied, created, or rewritten to restore this connection.

Keep shared profile data in `accounts` and commerce orders in `shop`; these schemas must remain exposed for their explicit Worker paths. Existing allowlisted RPCs remain in `public`, including the chat-list/direct-chat routines; those routines call AfuChat tables internally. Do not claim or route them to `afuchat` unless production actually contains them there.

All AfuChat relation requests must pass through the existing `api.afuchat.com/v1/chat/data/*` Worker allowlist and preserve the caller's bearer so table RLS continues to apply. The Worker maps a legacy incoming `public` profile header to the canonical `afuchat` schema for already-installed clients; it must never forward that header as a public relation request. Keep the named RPC allowlist separate from relation routing.

**Why:** AfuChat table data belongs in the existing canonical schema, while shared profile, commerce, and existing RPC ownership must keep working during client rollout.

**How to apply:** When restoring AfuChat connectivity, expose the existing `afuchat` schema first while preserving prior exposed schemas and the explicit `accounts`/`shop` paths. Change only PostgREST configuration and app/Worker routing; do not modify database objects, rows, grants, or policies. Keep public RPCs on their live schema and maintain the Worker route/media bindings.
