-- AfuMusic cover images are stored in R2; these columns keep their public URL
-- and object key attached to the track metadata.
alter table public.music_tracks
  add column if not exists cover_url text,
  add column if not exists cover_storage_path text;
