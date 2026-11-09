---
name: Engagera AI integration
description: All AfuChat AI now routes through the /chat Supabase edge function via the Engagera SDK. Key is public in env.ts.
---

## How it works

- **SDK**: `@afuchat1/engagera` v0.1.5 — installed in `artifacts/mobile`
- **Edge function**: `POST https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/chat`
- **Auth header**: `x-engagera-api-key: eng_...`
- **Request**: `{ messages: [{role, content}], model?, stream?, conversationId?, contextHint? }`
- **Response**: `{ id, model, message: { role, content }, conversationId, usage }`
- **Key path**: `lib/env.ts` → `ENGAGERA_API_KEY` (hardcoded fallback, same pattern as SUPABASE_ANON_KEY)

## Client usage

`getEngagera()` in `lib/engagera.ts` is **synchronous** — do NOT `await` it:

```ts
const engagera = getEngagera();             // ✅ sync
const reply = await engagera.chat.create({ messages });
console.log(reply.content);
```

**Why:** The key comes from `env.ts` at import time; no async Supabase fetch needed. Previous async approach tried to read from `app_settings` via anon key → 42501 permission denied → AI silently returned "I couldn't connect."

## Where `getEngagera()` is called (all files must NOT await it)

- `lib/aiHelper.ts` — `askAi()` generic helper
- `modules/afuai/index.tsx` — main AfuAI chat module
- `app/(tabs)/search.tsx` — AI search insight
- `app/chat-search.tsx` — chat search AI insight
- `app/chat/[id].tsx` — AI Lens handoff + @afuai mention in chat

## Why key is in env.ts (not app_settings)

The `ENGAGERA_API_KEY` only authorises calls to this project's own Supabase edge function. app_settings RLS blocks anon reads (42501). Storing the key in env.ts as EXPO_PUBLIC matches the security model of SUPABASE_ANON_KEY — the edge function owns rate-limiting.
