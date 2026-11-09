---
name: Support tickets schema + AI reply
description: Schema fixes for support_tickets/support_messages, and how the AI auto-reply edge function is triggered.
---

## Schema fixes applied (2026-07-26)
- `support_tickets` was missing `has_ai_draft boolean DEFAULT false` — caused every SELECT (which included that column) to fail silently, making the tickets list appear empty.
- DB trigger `trg_support_message_bump_ticket` on `support_messages INSERT` bumps `support_tickets.updated_at` so the list re-sorts on new replies.
- Migration file: `supabase/migrations/20260726_support_tickets_schema_fix.sql`

## AI auto-reply flow
- Edge function: `support-ai-reply` (deployed, `verify_jwt = true`)
- Client calls it fire-and-forget via `supabase.functions.invoke("support-ai-reply", { body: { ticket_id } })` immediately after inserting the first user message in `submitTicket()` in `app/support/index.tsx`.
- Function fetches ticket + user messages, builds a category-aware system prompt, calls Engagera (`POST /chat` with `x-engagera-api-key`), inserts reply as `sender_type = "ai"` in `support_messages`, sets `has_ai_draft = true`.
- Idempotency guard: if `has_ai_draft` is already true the function returns `{ ok: true, skipped: true }`.
- Required secret: `ENGAGERA_API_KEY` — set via Management API (same key as in env.ts).
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are auto-injected by the Supabase runtime.

**Why:** The edge function needs service role to bypass RLS when writing AI messages (sender_id = null, which users can't write directly).
