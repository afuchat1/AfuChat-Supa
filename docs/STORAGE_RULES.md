# AfuChat Storage Rules — Mandatory for All Developers

> **This document is law. No exceptions, no shortcuts.**
> Any pull request that violates these rules must be rejected immediately.

---

## The One Rule

**All user-uploaded files live exclusively on Cloudflare R2, served through `cdn.afuchat.com`.**

Supabase Storage is permanently decommissioned. It must never be used again — not as a primary store, not as a fallback, not for testing, not "just temporarily."

---

## Why This Exists

All 22 Supabase Storage buckets were emptied, deleted, and wiped from the database. The storage RLS policies were dropped. The code-level fallbacks were removed. The database migration `20260503_drop_all_storage_buckets.sql` deleted every remaining object and bucket record. A full file-by-file migration was run to copy every legacy URL to R2. This was a deliberate, irreversible decision. Do not undo it.

---

## How Uploads Work

### Production (Vercel)

```
Client → POST /functions/v1/uploads/upload
       → Supabase Edge Function (supabase/functions/uploads/)
       → Cloudflare R2 (bucket: afuchat-media)
       → Returns: https://cdn.afuchat.com/<bucket>/<userId>/<filename>
```

### Development (Replit)

```
Client → POST /api/uploads/upload
       → Express API Server (artifacts/api-server/src/routes/uploads.ts)
       → Cloudflare R2 (bucket: afuchat-media)
       → Returns: https://cdn.afuchat.com/<bucket>/<userId>/<filename>
```

### Native (iOS / Android) — presigned PUT

```
Client → POST /functions/v1/uploads/sign  (or /api/uploads/sign)
       → Gets presigned PUT URL for R2
       → PUT bytes directly to R2
       → Uses returned publicUrl (https://cdn.afuchat.com/...)
```

All paths write to the same R2 bucket (`afuchat-media`) and return the same CDN URL format.

---

## URL Format — What Goes in the Database

Every media URL stored in Postgres **must** match this pattern:

```
https://cdn.afuchat.com/<bucket>/<userId>/<filename>
```

Examples:
```
https://cdn.afuchat.com/avatars/abc123/avatar_1234567890.jpg
https://cdn.afuchat.com/post-images/abc123/1234567890.png
https://cdn.afuchat.com/chat-media/abc123/room456/voice_1234.m4a
https://cdn.afuchat.com/videos/abc123/clip_1234567890.mp4
https://cdn.afuchat.com/stories/abc123/story_1234567890.jpg
```

If you see a URL containing `supabase.co/storage` in any database column — **that is a bug**. Fix it using the backfill endpoint described below.

---

## Allowed Logical Buckets

These are the only valid bucket names. They map to prefixes inside the single R2 bucket `afuchat-media`:

| Logical bucket     | R2 key prefix        | Usage                              |
|--------------------|----------------------|------------------------------------|
| `avatars`          | `avatars/`           | Profile pictures                   |
| `banners`          | `banners/`           | Profile banner images              |
| `post-images`      | `post-images/`       | Images attached to posts           |
| `videos`           | `videos/`            | Video posts                        |
| `stories`          | `stories/`           | Story media (auto-expires 30 days) |
| `group-avatars`    | `group-avatars/`     | Group/chat avatars                 |
| `chat-media`       | `chat-media/`        | Chat attachments (images, files)   |
| `voice-messages`   | `voice-messages/`    | Voice note recordings              |
| `shop-media`       | `shop-media/`        | Shop product images                |
| `match-photos`     | `match-photos/`      | Match/dating feature photos        |

**Do not create new buckets without updating this list, the edge function `ALLOWED_BUCKETS` set, and the API server `ALLOWED_BUCKETS` set.**

---

## R2 Credentials — Where They Live

R2 credentials are stored in the `public.app_settings` Supabase table and loaded at server boot via `artifacts/api-server/src/lib/bootstrap.ts`. For the edge function, they are also available as Supabase Edge Function secrets.

| Setting key                    | Description                                  |
|-------------------------------|----------------------------------------------|
| `CLOUDFLARE_ACCOUNT_ID`       | Cloudflare account ID                        |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 API token key ID                          |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API token secret                      |
| `R2_BUCKET`                   | R2 bucket name (`afuchat-media`)             |
| `R2_PUBLIC_BASE_URL`          | `https://cdn.afuchat.com`                    |
| `R2_S3_ENDPOINT`              | `https://<accountId>.r2.cloudflarestorage.com` |

**Never hardcode these values in code.** Always read from `process.env` (API server) or `Deno.env.get()` (edge function).

---

## The `uploadToStorage` Function — Use This, Nothing Else

In the mobile app, the single entry point for all file uploads is:

```typescript
import { uploadToStorage } from '@/lib/mediaUpload';

const { publicUrl, error } = await uploadToStorage(bucket, filePath, fileUri, contentType);
```

This function automatically routes to the correct endpoint (Supabase Edge Function on Vercel, Express server on Replit/dev). The returned `publicUrl` is always a `cdn.afuchat.com` URL — write it directly to the database.

**Do not call Supabase Storage APIs directly. Do not call `supabase.storage.from(...)` anywhere.**

---

## Code-Level Rules — What Is Permanently Banned

The following patterns are **banned** across the entire codebase. Any PR containing them must be rejected:

```typescript
// ✗ BANNED — Supabase Storage client usage
supabase.storage.from(bucket)
admin.storage.from(bucket)
supabase.storage.createBucket(...)
admin.storage.createBucket(...)
supabase.storage.upload(...)
admin.storage.upload(...)

// ✗ BANNED — Supabase Storage URLs in DB writes
const url = `${supabaseUrl}/storage/v1/object/public/...`

// ✗ BANNED — Supabase Storage REST API calls
fetch(`${supabaseUrl}/storage/v1/bucket`, ...)
fetch(`${supabaseUrl}/storage/v1/object/...`, ...)
```

The following pattern is the **only** correct one:

```typescript
// ✓ CORRECT — always use uploadToStorage from mediaUpload.ts
import { uploadToStorage } from '@/lib/mediaUpload';
const { publicUrl } = await uploadToStorage('avatars', `${userId}/avatar.jpg`, fileUri, 'image/jpeg');
// publicUrl === 'https://cdn.afuchat.com/avatars/<userId>/avatar.jpg'
```

---

## If You Find a Supabase Storage URL in the Database

Use the backfill endpoint to migrate the file to R2 and get its CDN URL:

```typescript
import { backfillLegacyUrl } from '@/lib/mediaUpload';

const { publicUrl, migrated, existed } = await backfillLegacyUrl(r2Key, legacySupabaseUrl);
// Then update the DB row with publicUrl
```

The backfill endpoint (`POST /functions/v1/uploads/backfill`) will:
1. HEAD the R2 key — if the file is already there, return its CDN URL immediately.
2. If not, fetch from the legacy Supabase URL, PUT it to R2, and return the CDN URL.

---

## Adding a New Upload Feature — Checklist

Before merging any feature that involves file uploads:

- [ ] Uses `uploadToStorage()` from `artifacts/mobile/lib/mediaUpload.ts`
- [ ] The bucket name is in `ALLOWED_BUCKETS` in both `artifacts/api-server/src/routes/uploads.ts` AND `supabase/functions/uploads/index.ts`
- [ ] The stored URL starts with `https://cdn.afuchat.com/`
- [ ] No reference to `supabase.storage`, `storage/v1/bucket`, or `storage/v1/object` anywhere in the diff
- [ ] No new Supabase Storage buckets created in Supabase dashboard

---

## Lifecycle Rules on R2

The following automatic expiry rules are applied to the R2 bucket:

| Prefix          | Expires after |
|-----------------|---------------|
| `stories/`      | 30 days       |
| `chat-media/` (tagged `lifecycle=ephemeral`) | 30 days |
| Incomplete multipart uploads | 7 days |

These are configured in `artifacts/api-server/src/lib/r2.ts` → `applyDefaultLifecycle()`.

---

## Summary

| Question                              | Answer                                                        |
|---------------------------------------|---------------------------------------------------------------|
| Where do uploads go?                  | Cloudflare R2 bucket `afuchat-media`                          |
| What URL format goes in the database? | `https://cdn.afuchat.com/<bucket>/<userId>/<file>`            |
| What Supabase Storage buckets exist?  | **Zero. None. The table is empty.**                           |
| Can I use Supabase Storage as a temp fallback? | **No.**                                              |
| What function do I use for uploads?   | `uploadToStorage()` in `artifacts/mobile/lib/mediaUpload.ts` |
| What if a file shows 404 on CDN?      | Use `backfillLegacyUrl()` — do not re-enable Supabase Storage |
