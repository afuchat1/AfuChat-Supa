-- Optional user-uploaded track artwork. Existing tracks continue to use the
-- shared neutral music-note fallback when these values are null.
ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS cover_art_url text,
  ADD COLUMN IF NOT EXISTS cover_art_path text;

COMMENT ON COLUMN public.music_tracks.cover_art_url IS
  'Public artwork URL uploaded by the track creator; never an audio playback URL.';
COMMENT ON COLUMN public.music_tracks.cover_art_path IS
  'Creator-owned R2 object path used to remove uploaded cover artwork.';
