# AfuChat media Worker

This Worker is a separate AfuChat service. It owns only the `afu-chat-assets`
R2 bucket and uses the shared Supabase Auth endpoint only to validate a
user's existing AfuChat session. It does not use or deploy the AfuCloud Worker,
bucket, or data.

The API route is `api.afuchat.com/afuchat/*`; public media is served from
`cdn.afuchat.com/chat/*`. Existing upload client routes are preserved for
session exchange, container discovery/creation, streaming uploads, upload
confirmation, object listing/deletion, and storage usage.

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
files and their owner/container identifiers in the AfuChat R2 bucket only.
Session checks go to Supabase Auth; user data and service-role credentials are
never proxied through this Worker.