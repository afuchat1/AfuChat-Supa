-- AfuSearch learned visual retrieval.
-- Embeddings are produced by the separately deployed OpenCLIP inference service.
-- Existing dHash/OCR retrieval remains available as complementary signals.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.visual_image_index
  ADD COLUMN IF NOT EXISTS image_embedding extensions.vector(512),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_created_at timestamptz;

COMMENT ON COLUMN public.visual_image_index.image_embedding IS
  'L2-normalized 512-dimensional OpenCLIP image embedding; NULL until inference backfill succeeds.';
COMMENT ON COLUMN public.visual_image_index.embedding_model IS
  'Exact model/pretrained version used to produce image_embedding. Re-embed when model version changes.';

CREATE INDEX IF NOT EXISTS visual_image_index_embedding_hnsw_idx
  ON public.visual_image_index
  USING hnsw (image_embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE image_embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.find_visual_embedding_matches(
  p_embedding extensions.vector(512),
  p_limit integer DEFAULT 40,
  p_min_similarity double precision DEFAULT 0.18
)
RETURNS TABLE (
  image_url text,
  post_id uuid,
  similarity double precision,
  embedding_model text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT
    i.image_url,
    i.post_id,
    (1 - (i.image_embedding <=> p_embedding))::double precision AS similarity,
    i.embedding_model
  FROM public.visual_image_index AS i
  INNER JOIN public.posts AS p ON p.id = i.post_id
  WHERE i.image_embedding IS NOT NULL
    AND p.visibility = 'public'
    AND coalesce(p.is_blocked, false) = false
    AND p.id IS NOT NULL
    AND (1 - (i.image_embedding <=> p_embedding)) >= greatest(-1.0, least(1.0, coalesce(p_min_similarity, 0.18)))
  ORDER BY i.image_embedding <=> p_embedding
  LIMIT greatest(1, least(coalesce(p_limit, 40), 100));
$$;

REVOKE ALL ON FUNCTION public.find_visual_embedding_matches(extensions.vector, integer, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_visual_embedding_matches(extensions.vector, integer, double precision) TO service_role;

NOTIFY pgrst, 'reload schema';
