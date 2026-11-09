---
name: AfuMusic schema drift
description: The Supabase project may contain a legacy public music_tracks table before the private AfuMusic schema is applied.
---

Treat AfuMusic migrations as additive. The existing project can have legacy music_tracks rows with audio_url, artist, usage_count, and is_featured but without creator, pricing, storage, or status columns.

**Why:** The AfuMusic database migration was applied to a project where music_tracks already existed with a different shape; create table if not exists did not add the required columns.

**How to apply:** Preserve legacy rows and add new fields with safe defaults. Keep direct audio_url fallback only for free legacy tracks; paid playback must use authenticated signed reads.

## Live paid-audio and migration check
On 2026-10-13, read-only inspection found the live project missing the newer cover-art, video-license, and post-soundtrack fields, with no AfuMusic migration-ledger rows. Both paid catalog records had public cdn.afuchat.com URLs that returned HTTP 200 without authentication. Clearing audio_url in SQL does not disable the public R2/CDN path.

**Why:** The app's signed /uploads/read route cannot enforce purchase rights when the same object remains directly reachable on the public CDN.

**How to apply:** Before calling paid audio secure, verify the real production schema and make the music object path private at Cloudflare/R2, then clear legacy paid audio_url values and apply the guarded catalog/purchase migration. Check both the custom CDN and the bucket's managed r2.dev domain: a zone WAF rule only protects the custom hostname, while disabling r2.dev leaves the custom domain active but removes that alternate public hostname for every object in the bucket.