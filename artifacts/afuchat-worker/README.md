# AfuChat media and Supabase compatibility module

This source module contains the AfuChat media handler and Supabase Auth, REST,
and Realtime compatibility proxy. It is composed into the independently
deployed `afuchat-api` Worker by `backend/afu-chat-api/deploy.mjs`; it is not a
standalone Worker and must not be deployed separately. It does not use the
AfuCloud Worker, bucket, or data.

Canonical AfuChat product APIs use `https://api.afuchat.com/v1/chat/*`;
storage APIs use `/v1/chat/storage/*`. The deploy wrapper maps those canonical
storage requests internally to this handler without exposing its old path
layout to clients. The old `/v1/storage*` and `/chat/*` API aliases have been
removed and must not be reintroduced. AfuAuth continues to own
`/v1/auth/*`; the API root remains assigned to the separate `afu-api` gateway.

Supabase compatibility paths (`/chat/auth/v1`, `/chat/rest/v1`, and
`/chat/realtime/v1`) keep the caller's Authorization header so Supabase RLS
remains authoritative. Public media is served from
`cdn.afuchat.com/chat/*`.

The AfuChat deployment wrapper transpiles this module and composes it into the
`afuchat-api` bundle. Keep production checks and deployment in
`backend/afu-chat-api/`; do not add a separate Wrangler config or deploy command
for this module.