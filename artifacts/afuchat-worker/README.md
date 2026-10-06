# AfuChat media and Supabase compatibility handler

This Worker source contains the existing AfuChat media handler and Supabase
Auth, REST, and Realtime compatibility proxy. It is composed into the
independently deployed `afuchat-api` Worker by `backend/afu-chat-api/deploy.mjs`.
It does not use or deploy the AfuCloud Worker, bucket, or data.

Canonical AfuChat product APIs use `https://api.afuchat.com/v1/chat/*`;
storage APIs use `/v1/chat/storage/*`. The deploy wrapper maps those canonical
storage requests internally to this handler without exposing its old path
layout to new clients. Old `/v1/storage*` paths remain temporary compatibility
aliases for already-released clients. AfuAuth continues to own
`/v1/auth/*`.

Supabase compatibility paths (`/chat/auth/v1`, `/chat/rest/v1`, and
`/chat/realtime/v1`) keep the caller's Authorization header so Supabase RLS
remains authoritative. Public media is served from
`cdn.afuchat.com/chat/*`.

## Local checks

```sh
pnpm install --ignore-workspace
pnpm typecheck
pnpm dev
```

## Production prerequisites

Before deploying, verify in Cloudflare that the `afuchat.com` zone, both
non-overlapping routes, and the `afu-chat-assets` bucket are AfuChat-owned and
available. Then authenticate Wrangler with a Cloudflare API token that has
Worker and R2 permissions. The configured API key alone is not accepted by
Wrangler in this workspace.

Do not use the shared `afuchat` schema for file metadata: this Worker stores
files and their owner/container identifiers in the AfuChat R2 bucket. Only the
Supabase public anon key and caller-authenticated requests are forwarded; never
add a service-role key or database password to this Worker.