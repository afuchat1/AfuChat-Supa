-- ─── Video encoding pipeline ──────────────────────────────────────────────
-- Hybrid H.264 (AVC) + AV1 encoding with adaptive resolutions, DB-backed
-- queue, and per-rendition tracking. Designed to be extended later with
-- HLS/DASH variants by adding rows to video_renditions with container='hls'.

-- One row per uploaded source video.
CREATE TABLE IF NOT EXISTS public.video_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id            UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  source_path        TEXT NOT NULL,        -- path inside the `videos` bucket
  source_size_bytes  BIGINT,
  source_mime        TEXT,
  duration_seconds   NUMERIC(8, 2),
  width              INT,
  height             INT,
  poster_path        TEXT,                 -- thumbnail path inside `videos`
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','processing','ready','failed')),
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_assets_owner   ON public.video_assets (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_assets_post    ON public.video_assets (post_id);
CREATE INDEX IF NOT EXISTS idx_video_assets_status  ON public.video_assets (status);

-- One row per encoded variant (codec × container × resolution).
CREATE TABLE IF NOT EXISTS public.video_renditions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID NOT NULL REFERENCES public.video_assets(id) ON DELETE CASCADE,
  codec           TEXT NOT NULL CHECK (codec IN ('h264','av1')),
  container       TEXT NOT NULL DEFAULT 'mp4'
                    CHECK (container IN ('mp4','webm','hls','dash')),
  height          INT  NOT NULL,           -- 360, 720, 1080
  width           INT,
  bitrate_kbps    INT,
  storage_path    TEXT,                    -- path in `videos` bucket
  size_bytes      BIGINT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','ready','failed')),
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, codec, container, height)
);

CREATE INDEX IF NOT EXISTS idx_video_renditions_asset
  ON public.video_renditions (asset_id);
CREATE INDEX IF NOT EXISTS idx_video_renditions_ready
  ON public.video_renditions (asset_id, codec, height) WHERE status = 'ready';

-- DB-backed FIFO queue for encoding work.
-- Lower priority value = higher priority. h264 jobs get priority 10
-- so they are processed first (fast availability after upload);
-- av1 jobs get priority 50 (background bandwidth optimization).
CREATE TABLE IF NOT EXISTS public.video_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       UUID NOT NULL REFERENCES public.video_assets(id)     ON DELETE CASCADE,
  rendition_id   UUID NOT NULL REFERENCES public.video_renditions(id) ON DELETE CASCADE,
  codec          TEXT NOT NULL CHECK (codec IN ('h264','av1')),
  height         INT  NOT NULL,
  priority       INT  NOT NULL DEFAULT 100,
  status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','running','done','failed')),
  attempts       INT  NOT NULL DEFAULT 0,
  max_attempts   INT  NOT NULL DEFAULT 3,
  worker_id      TEXT,
  scheduled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_dispatch
  ON public.video_jobs (status, priority, scheduled_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_video_jobs_running
  ON public.video_jobs (status, started_at) WHERE status = 'running';

-- Link a post to its primary video asset for fast manifest lookup.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS video_asset_id UUID REFERENCES public.video_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_video_asset_id
  ON public.posts (video_asset_id) WHERE video_asset_id IS NOT NULL;

-- ─── Atomic dequeue ───────────────────────────────────────────────────────
-- Pulls the next queued job (optionally filtered to a codec set), marks it
-- 'running', stamps worker_id/started_at, increments attempts. Uses
-- FOR UPDATE SKIP LOCKED so multiple workers can run concurrently safely.
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

  UPDATE public.video_jobs
     SET status      = 'running',
         worker_id   = p_worker_id,
         started_at  = now(),
         attempts    = attempts + 1
   WHERE video_jobs.id = v_job_id;

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

-- ─── Roll up rendition status into asset.status ───────────────────────────
-- An asset becomes 'ready' as soon as its baseline (h264, lowest height)
-- rendition is ready, since that guarantees universal playback. AV1 and
-- higher resolutions continue encoding in the background.
CREATE OR REPLACE FUNCTION public.video_assets_rollup_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_asset UUID := COALESCE(NEW.asset_id, OLD.asset_id);
  v_has_ready_h264 BOOLEAN;
  v_all_failed BOOLEAN;
  v_has_any_active BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.video_renditions
    WHERE asset_id = v_asset AND codec = 'h264' AND status = 'ready'
  ) INTO v_has_ready_h264;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.video_renditions
    WHERE asset_id = v_asset AND status <> 'failed'
  ) INTO v_all_failed;

  SELECT EXISTS (
    SELECT 1 FROM public.video_renditions
    WHERE asset_id = v_asset AND status IN ('pending','processing')
  ) INTO v_has_any_active;

  IF v_has_ready_h264 THEN
    UPDATE public.video_assets
       SET status = 'ready', updated_at = now()
     WHERE id = v_asset AND status <> 'ready';
  ELSIF v_all_failed THEN
    UPDATE public.video_assets
       SET status = 'failed', updated_at = now()
     WHERE id = v_asset AND status <> 'failed';
  ELSIF v_has_any_active THEN
    UPDATE public.video_assets
       SET status = 'processing', updated_at = now()
     WHERE id = v_asset AND status = 'pending';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_renditions_rollup ON public.video_renditions;
CREATE TRIGGER trg_video_renditions_rollup
  AFTER INSERT OR UPDATE OF status ON public.video_renditions
  FOR EACH ROW EXECUTE FUNCTION public.video_assets_rollup_status();

-- ─── updated_at maintenance ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_video_assets_touch ON public.video_assets;
CREATE TRIGGER trg_video_assets_touch
  BEFORE UPDATE ON public.video_assets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_video_renditions_touch ON public.video_renditions;
CREATE TRIGGER trg_video_renditions_touch
  BEFORE UPDATE ON public.video_renditions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Row-Level Security ───────────────────────────────────────────────────
ALTER TABLE public.video_assets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_renditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_jobs       ENABLE ROW LEVEL SECURITY;

-- Public-readable for the storefront/feed (assets & renditions only).
DROP POLICY IF EXISTS "video_assets_public_select"     ON public.video_assets;
CREATE POLICY "video_assets_public_select"     ON public.video_assets
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "video_renditions_public_select" ON public.video_renditions;
CREATE POLICY "video_renditions_public_select" ON public.video_renditions
  FOR SELECT USING (true);

-- Owners may delete their own assets (cascades to renditions/jobs).
DROP POLICY IF EXISTS "video_assets_owner_delete" ON public.video_assets;
CREATE POLICY "video_assets_owner_delete" ON public.video_assets
  FOR DELETE USING (auth.uid() = owner_id);

-- All writes go through the service-role key (API server). No public policies
-- for INSERT/UPDATE on video_assets, video_renditions, or video_jobs.
