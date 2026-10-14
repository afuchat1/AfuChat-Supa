-- Minimal, additive production setup for safely publishing new paid tracks.
-- Existing track URLs and files are intentionally left untouched.

ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'music';

COMMENT ON COLUMN public.music_tracks.storage_bucket IS
  'Logical R2 bucket for this track: music for public/free tracks, music-private for paid tracks.';

CREATE OR REPLACE FUNCTION public.afumusic_creator_has_premium(p_creator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(p_creator_id = auth.uid(), false)
    AND EXISTS (
      SELECT 1
      FROM public.user_subscriptions us
      JOIN public.subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = p_creator_id
        AND us.is_active = true
        AND us.expires_at >= now()
        AND lower(coalesce(sp.tier, '')) IN ('silver', 'gold', 'platinum')
    );
$$;

REVOKE ALL ON FUNCTION public.afumusic_creator_has_premium(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.afumusic_creator_has_premium(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_afumusic_private_storage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(NEW.price_acoin, 0) > 0 THEN
    IF NEW.storage_bucket IS DISTINCT FROM 'music-private' THEN
      RAISE EXCEPTION 'afumusic_paid_track_requires_private_storage';
    END IF;

    IF NEW.creator_id IS NULL
      OR NEW.storage_path IS NULL
      OR position('/' IN NEW.storage_path) = 0
      OR right(NEW.storage_path, 1) = '/'
      OR split_part(NEW.storage_path, '/', 1) IS DISTINCT FROM NEW.creator_id::text
    THEN
      RAISE EXCEPTION 'afumusic_paid_track_requires_owner_scoped_storage_path';
    END IF;

    IF NEW.audio_url IS NOT NULL THEN
      RAISE EXCEPTION 'afumusic_paid_track_cannot_store_public_audio_url';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_afumusic_private_storage() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guard_afumusic_private_storage() TO authenticated, service_role;

DROP TRIGGER IF EXISTS afumusic_private_storage_guard ON public.music_tracks;
CREATE TRIGGER afumusic_private_storage_guard
  BEFORE INSERT OR UPDATE OF price_acoin, storage_bucket, storage_path, audio_url
  ON public.music_tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_afumusic_private_storage();
