-- Keep the database helper for administrative/manual cleanup. The scheduled
-- cleanup itself runs in the AfuCloud Worker, which also removes R2 objects.

CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.stories
   WHERE expires_at IS NOT NULL
     AND expires_at <= now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_stories() FROM PUBLIC;