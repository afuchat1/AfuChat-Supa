---
name: AfuMusic schema drift
description: The Supabase project may contain a legacy public music_tracks table before the private AfuMusic schema is applied.
---

Treat AfuMusic migrations as additive. The existing project can have legacy music_tracks rows with audio_url, artist, usage_count, and is_featured but without creator, pricing, storage, or status columns.

**Why:** The AfuMusic database migration was applied to a project where music_tracks already existed with a different shape; create table if not exists did not add the required columns.

**How to apply:** Preserve legacy rows and keep their public audio URL fallback. Add new columns with safe defaults, and verify the three Music tables and private music bucket after applying schema changes.