-- Remove the Watch Together / live matches feature.
-- All data, tables, triggers, and helper functions introduced in
-- 20260429_watch_together.sql are dropped. Idempotent.

DROP TABLE IF EXISTS public.watch_reactions     CASCADE;
DROP TABLE IF EXISTS public.watch_messages      CASCADE;
DROP TABLE IF EXISTS public.watch_match_events  CASCADE;
DROP TABLE IF EXISTS public.watch_rooms         CASCADE;
DROP TABLE IF EXISTS public.watch_matches       CASCADE;

DROP FUNCTION IF EXISTS public.fn_watch_create_room()        CASCADE;
DROP FUNCTION IF EXISTS public.fn_watch_event_to_message()   CASCADE;
DROP FUNCTION IF EXISTS public.fn_watch_matches_touch()      CASCADE;
