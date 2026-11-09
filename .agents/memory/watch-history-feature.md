---
name: Watch History feature
description: Cross-device video watch history — Supabase table, API route, mobile screen, wiring. One manual step required.
---

# Watch History Feature

## Files created
- `supabase/migrations/20260615_video_watch_history.sql` — DDL + RLS policies. **Must be applied manually in Supabase Dashboard → SQL Editor.**
- `artifacts/api-server/src/routes/watch-history.ts` — GET/POST/DELETE(/postId) endpoints using admin client
- `artifacts/mobile/lib/watchHistory.ts` — `recordWatchHistory`, `getWatchHistory`, `removeFromWatchHistory`, `clearAllWatchHistory` using anon client (RLS-safe)
- `artifacts/mobile/app/watch-history.tsx` — SectionList by date, thumbnail+progress bar, swipe delete, Clear All with algorithm reset

## Wiring
- `artifacts/api-server/src/routes/index.ts` — watchHistoryRouter registered
- `artifacts/mobile/components/VideoFeed.tsx` — `recordWatchHistory` called alongside `markVideoWatched` in watch-save guard
- `artifacts/mobile/app/video/[id].tsx` — same
- `artifacts/mobile/app/(tabs)/me.tsx` — "Watch History" menu item (icon: `time-outline`, color `#00BCD4`) between Saved Posts and Creator Analytics

## Algorithm reset
`clearAllWatchHistory()` deletes from Supabase AND removes `seen_video_ids_v2` + `seen_feed_post_ids_v2` from AsyncStorage. Optional: also clears `feed_interaction_weights_v1`.

## Gotchas
- Smart/curly quotes (`"`) inside regular `"` string literals crash Hermes parser. Replace with plain text or `\u201c`/`\u201d` escapes.
- Supabase PAT `sbp_*` returned 401 for all Management API calls — cannot apply DDL migrations programmatically from Replit. User must run migration in Supabase Dashboard.
- `upsert` on `(user_id, post_id)` uses `onConflict: "user_id,post_id"` — no increment_video_watch_count RPC needed; watch_count starts at 1.
