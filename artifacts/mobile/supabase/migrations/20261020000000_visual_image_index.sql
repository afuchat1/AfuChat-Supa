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

-- Match fingerprints in the database so the search covers the full persistent index,
-- rather than only the latest page of cached fingerprints.
CREATE OR REPLACE FUNCTION public.find_visual_image_matches(
  p_hash text,
  p_max_distance integer DEFAULT 10,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  image_url text,
  post_id uuid,
  perceptual_hash text,
  distance integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH scored AS (
    SELECT
      i.image_url,
      i.post_id,
      i.perceptual_hash,
      i.indexed_at,
      (
        SELECT count(*)::integer
        FROM generate_series(0, 63) AS bits(bit_pos)
        WHERE get_bit(decode(i.perceptual_hash, 'hex'), bit_pos)
          <> get_bit(decode(p_hash, 'hex'), bit_pos)
      ) AS distance
    FROM public.visual_image_index AS i
    WHERE p_hash ~ '^[0-9a-f]{16}$'
  )
  SELECT scored.image_url, scored.post_id, scored.perceptual_hash, scored.distance
  FROM scored
  WHERE scored.distance <= greatest(0, least(coalesce(p_max_distance, 10), 64))
  ORDER BY scored.distance ASC, scored.indexed_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100));
$$;

REVOKE ALL ON FUNCTION public.find_visual_image_matches(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_visual_image_matches(text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
