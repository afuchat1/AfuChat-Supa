-- Fix ambiguous column reference "attempts" in claim_video_job.
-- The RETURNS TABLE declares a column named "attempts", which conflicts with
-- the table column of the same name in the UPDATE statement. Fix: qualify
-- the column with the table alias (vj.attempts) in the SET clause.

CREATE OR REPLACE FUNCTION public.claim_video_job(
  p_worker_id TEXT,
  p_codecs    TEXT[] DEFAULT ARRAY['h264','av1']
)
RETURNS TABLE (
  id             UUID,
  asset_id       UUID,
  rendition_id   UUID,
  codec          TEXT,
  height         INT,
  attempts       INT,
  max_attempts   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  SELECT j.id INTO v_job_id
  FROM public.video_jobs j
  WHERE j.status = 'queued'
    AND j.codec = ANY(p_codecs)
    AND j.scheduled_at <= now()
  ORDER BY j.priority ASC, j.scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.video_jobs vj
     SET status      = 'running',
         worker_id   = p_worker_id,
         started_at  = now(),
         attempts    = vj.attempts + 1
   WHERE vj.id = v_job_id;

  -- Mark rendition as processing too (best-effort).
  UPDATE public.video_renditions r
     SET status = 'processing', updated_at = now()
   FROM public.video_jobs j
   WHERE j.id = v_job_id
     AND r.id = j.rendition_id;

  -- And asset → processing if still pending.
  UPDATE public.video_assets a
     SET status = 'processing', updated_at = now()
   FROM public.video_jobs j
   WHERE j.id = v_job_id
     AND a.id = j.asset_id
     AND a.status = 'pending';

  RETURN QUERY
  SELECT j.id, j.asset_id, j.rendition_id, j.codec, j.height, j.attempts, j.max_attempts
  FROM public.video_jobs j
  WHERE j.id = v_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_video_job(TEXT, TEXT[]) TO service_role;
