# AfuChat Worker

This is an AfuChat-owned Cloudflare Worker. It proxies Supabase Auth, REST, and
Realtime under `api.afuchat.com/afuchat`, and owns the `afu-chat-assets` R2
bucket for AfuChat media. It does not use or deploy the AfuCloud Worker, bucket,
or data.

The API route is `api.afuchat.com/afuchat/*`; public media is served from
`cdn.afuchat.com/chat/*`. Supabase paths (`/auth/v1`, `/rest/v1`, and
`/realtime/v1`) are forwarded to the configured Supabase project while keeping
the caller's Authorization header so Supabase RLS remains authoritative.
Existing media routes remain available for session exchange, container
discovery/creation, streaming uploads, upload confirmation, object
listing/deletion, and storage usage.

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