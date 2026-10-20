-- Traditional computer-vision index for AfuSearch image matching.
-- This stores perceptual hashes only; it does not call an AI or vision model.

CREATE TABLE IF NOT EXISTS public.visual_image_index (
  image_url text PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  perceptual_hash text NOT NULL CHECK (perceptual_hash ~ '^[0-9a-f]{16}$'),
  indexed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visual_image_index_hash_idx
  ON public.visual_image_index (perceptual_hash);
CREATE INDEX IF NOT EXISTS visual_image_index_post_idx
  ON public.visual_image_index (post_id);
CREATE INDEX IF NOT EXISTS visual_image_index_recent_idx
  ON public.visual_image_index (indexed_at DESC);

ALTER TABLE public.visual_image_index ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.visual_image_index FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.visual_image_index TO service_role;
