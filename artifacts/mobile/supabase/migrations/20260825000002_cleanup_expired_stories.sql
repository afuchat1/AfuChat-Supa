-- Schedule the cleanup-expired-stories Edge Function. It removes both the
-- database rows and Cloudflare R2 objects.
-- directly from SQL on Supabase.

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

-- Run frequently enough that an expired story does not remain available for
-- more than a short cleanup window after its 24-hour lifetime.
DO $cleanup_job$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO existing_job_id
    FROM cron.job
   WHERE jobname = 'cleanup-expired-stories';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'cleanup-expired-stories',
    '*/15 * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/cleanup-expired-stories',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$
  );
END;
$cleanup_job$;