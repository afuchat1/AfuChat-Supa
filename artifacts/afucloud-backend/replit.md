# AfuCloud

A developer-first cloud platform for storing, processing, managing, and delivering digital assets. Phase 1 focuses on the Images platform, with a full SaaS dashboard, REST API, and Cloudflare R2 object storage.

## Run & Operate

- `pnpm install --frozen-lockfile` — restore the exact workspace dependencies before validation
- `pnpm run typecheck` — validate DB declarations, frontend, API server, Worker, and scripts
- `pnpm run build` — run the full typecheck and build pipeline
- `pnpm --filter @workspace/afucloud run build` — build the frontend bundle
- `pnpm --filter @workspace/api-server run typecheck` — validate API server changes after `lib/db` changes
- `pnpm --filter @workspace/cf-worker run typecheck` — validate the production Worker
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

### Local API verification pipeline

The managed `artifacts/api-server: API Server` workflow runs the API build once and
then starts the generated bundle. Restart that workflow after changing API code,
`lib/db` schemas, database environment variables, or dependencies; otherwise the
running process can serve an older bundle than the source tree.

Before testing login or protected routes:

1. Confirm the workflow log contains `Server listening` and no startup error.
2. Run `pnpm run typecheck`.
3. Run `pnpm run build`.
4. Smoke-test the local API without real credentials:

```bash
curl -sS -o /tmp/login-400.json -w 'status=%{http_code}\n' \
  -X POST http://127.0.0.1:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"","password":""}'
# Expected: status=400

curl -sS -o /tmp/login-401.json -w 'status=%{http_code}\n' \
  -X POST http://127.0.0.1:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"smoke-test.invalid@example.invalid","password":"not-a-real-password"}'
# Expected: status=401
```

Never put a real password in shell history, logs, tests, or documentation. The
API returns JSON for unexpected failures, and the login route returns a controlled
503 when the shared authentication database is unavailable.

### Local upload behavior

When Cloudflare R2 credentials are not present in the API workflow, upload URL
generation intentionally returns the local endpoint
`/api/v1/storage/dev-upload/:key`. The API accepts the binary PUT, stores it
under the ignored `.dev-storage/` directory, and serves it back through
`/api/v1/storage/:key`. This fallback is for local preview only; production
uses signed R2 URLs.

After changing storage routes, verify the local binary round trip before testing
the UI: PUT a small fixture to the generated `dev-upload` URL, GET the matching
storage URL, and compare the bytes. A 404 at the PUT stage means the API
workflow is stale or the development handler is missing.

## Runtime Boundary

- Replit is source storage and editing only; no Replit server is part of the AfuCloud runtime.
- The production frontend sends API requests directly to `https://api.afuchat.com`.
- The Cloudflare Worker is the only API layer and is the only component allowed to access Supabase and R2.
- AfuChat and AfuCloud are one product and share this backend and database. The
  Worker is the only public/application backend. Supabase PostgreSQL and Auth
  are internal infrastructure accessed by the Worker; clients must not use
  Supabase Storage or Supabase Edge Functions. Cloudflare R2 replaces Supabase
  Storage, and all application functions must be implemented as Worker routes.
- Do not put AfuCloud secrets, database URLs, or storage credentials in frontend variables.
- Production secrets are stored only in the Cloudflare Worker secret store.

## Infrastructure

- **Database**: Supabase PostgreSQL (project: `poijhidfekwfthyksatp`, region: eu-west-1), with shared identities in Supabase's `auth.users`; shared profiles live in `accounts.profiles`, while AfuCloud-owned data lives in the `afucloud` schema
- **Object storage**: Cloudflare R2 bucket `afucloud-images`
- **Frontend**: React + Vite + shadcn/ui + Tailwind v4, deployed separately from the API
- **Backend**: Cloudflare Worker (Hono) (`artifacts/cf-worker/`) — deployed to Cloudflare's edge

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Hono on Cloudflare Workers
- DB: Supabase PostgreSQL and Auth through the Worker
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Frontend auth: JWT stored in `localStorage` as `afucloud_token`
- Shared auth: Supabase's `auth.users` is the only identity and credential source for AfuChat, AfuMail, AfuAI, AfuCloud, and AfuAds. Shared profile data lives in `accounts.profiles` keyed by `user_id`; AfuCloud domain tables live under `afucloud.*` and reference `auth.users(id)` directly
- The Worker accesses AfuChat's existing public tables and RPCs server-side; do
  not duplicate them into `afucloud.*`. New AfuCloud-owned tables still belong
  in `afucloud.*`, while `auth.users` and `accounts.profiles` remain shared.
- Passwords and identity are managed by Supabase Auth; the Worker never creates a product-specific credential store
- The Node API maps Supabase Auth explicitly with `pgSchema("auth")`; do not use an unqualified `users` table for login queries
- Storage: Cloudflare R2 (S3-compatible) with pre-signed PUT URLs

## Where Things Live

- `artifacts/afucloud/` — React frontend (SaaS dashboard)
- `artifacts/cf-worker/` — Cloudflare Worker edge API (production)
- `lib/db/` — Drizzle ORM schema + migrations (source of truth for DB schema)
- `lib/api-spec/` — OpenAPI 3.1 spec (source of truth for API contract)
- `lib/api-zod/` — Zod schemas generated from OpenAPI spec (for API validation)
- `lib/api-client-react/` — React Query hooks generated from OpenAPI spec (for frontend)

## Cloudflare Worker — Deployment

The CF Worker in `artifacts/cf-worker/` is the production edge API. It uses Hono + Supabase REST + aws4fetch.

### Canonical production deployment

There is one permanent production Worker:

- **Worker name:** `afucloud-api`
- **Source:** `artifacts/cf-worker/wrangler.toml`
- **Public API:** `https://api.afuchat.com`
- **Route:** `api.afuchat.com/*`
- **Database/Auth:** Supabase project `poijhidfekwfthyksatp`

All AfuCloud products and projects must use this Worker. Do not create product-specific Workers or point clients at temporary `workers.dev` deployments.

### Production secrets setup (Cloudflare only)

Run from `artifacts/cf-worker/` using a Cloudflare deployment token:

```bash
cd artifacts/cf-worker
npx wrangler secret put JWT_SECRET
npx wrangler secret put SUPABASE_SERVICE_KEY   # service_role key from Supabase dashboard
npx wrangler secret put CLOUDFLARE_R2_SECRET_ACCESS_KEY
```

### Deploy:

```bash
pnpm --filter @workspace/cf-worker run deploy
# or directly:
cd artifacts/cf-worker && npx wrangler deploy
```

### Environment variables in `wrangler.toml` (non-secret):

- `SUPABASE_URL` — `https://poijhidfekwfthyksatp.supabase.co`
- `CLOUDFLARE_ACCOUNT_ID` — `42e79186125e8ff83e51f15816e074de`
- `CLOUDFLARE_R2_ACCESS_KEY_ID` — R2 access key ID
- `R2_BUCKET_NAME` — `afucloud-images`
- `R2_PUBLIC_URL` — (optional) public CDN URL

## Architecture Decisions

- API-first design: all behavior defined in `lib/api-spec/openapi.yaml`, code generated from it
- App sessions use AfuCloud access/refresh tokens, but credentials and identity remain in Supabase Auth's `auth.users`; no product schema may add a password or product-specific user table
- The Worker uses Supabase REST and explicitly schema-qualified tables: `accounts.profiles` for shared profile data and `afucloud.*` for AfuCloud domain data
- Production secrets exist only in the Cloudflare Worker secret store; Replit has no production secret dependency
- Supabase Auth owns password verification and password changes; the Worker is the only API layer

## Design

- Cream/warm background (`#FAF8F5`) with flat UI (no shadows)
- Primary: teal (`hsl(173, 70%, 35%)`)
- Fonts: DM Sans (body), Satoshi (display), JetBrains Mono (code)

## User Preferences

- Cream + flat UI aesthetic with advanced UX and layouts
- Production infrastructure secrets are stored in Cloudflare's secret store
- Build as a full SaaS platform (developer-first cloud storage)
