-- ─── Video feed: add is_blocked column + post_views table ─────────────────
-- is_blocked: lets admins hide individual posts from the feed without
-- deleting them (moderation). Defaults to FALSE so existing rows are unaffected.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_is_blocked
  ON public.posts (is_blocked)
  WHERE is_blocked = TRUE;

-- ─── post_views ────────────────────────────────────────────────────────────
-- One row per (viewer × post) view event. Used by the For You algorithm to
-- rank content by engagement and de-rank already-watched videos.
CREATE TABLE IF NOT EXISTS public.post_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_post_views_post
  ON public.post_views (post_id);

CREATE INDEX IF NOT EXISTS idx_post_views_viewer
  ON public.post_views (viewer_id, created_at DESC);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_views_select_own" ON public.post_views;
CREATE POLICY "post_views_select_own" ON public.post_views
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "post_views_insert_own" ON public.post_views;
CREATE POLICY "post_views_insert_own" ON public.post_views
  FOR INSERT WITH CHECK (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "post_views_delete_own" ON public.post_views;
CREATE POLICY "post_views_delete_own" ON public.post_views
  FOR DELETE USING (auth.uid() = viewer_id);
