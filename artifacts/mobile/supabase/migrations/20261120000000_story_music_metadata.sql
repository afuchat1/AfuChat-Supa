-- Optional soundtrack excerpts for image and video stories.
alter table public.stories
  add column if not exists music_track_id uuid,
  add column if not exists music_start_seconds double precision,
  add column if not exists music_end_seconds double precision;
