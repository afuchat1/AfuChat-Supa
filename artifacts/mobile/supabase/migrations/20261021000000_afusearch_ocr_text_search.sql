-- AfuSearch OCR-backed text-in-image search; traditional OCR and SQL search only.
-- No AI models, embeddings, or generated descriptions are used.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.visual_image_index
  ADD COLUMN IF NOT EXISTS ocr_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ocr_processed_at timestamptz;

ALTER TABLE public.visual_image_index
  ADD COLUMN IF NOT EXISTS ocr_search tsvector
  GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce(ocr_text, ''))) STORED;

CREATE INDEX IF NOT EXISTS visual_image_index_ocr_search_idx
  ON public.visual_image_index USING gin (ocr_search);
CREATE INDEX IF NOT EXISTS visual_image_index_ocr_trgm_idx
  ON public.visual_image_index USING gin (lower(ocr_text) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS visual_image_index_ocr_pending_idx
  ON public.visual_image_index (indexed_at)
  WHERE ocr_processed_at IS NULL;

-- Search text read from images. OCR text can match exact words, phrases, and
-- tolerant near-keyword spellings. Callers must still enforce post visibility.
CREATE OR REPLACE FUNCTION public.find_visual_text_matches(
  p_query text,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  image_url text,
  post_id uuid,
  ocr_text text,
  score real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  WITH input AS (
    SELECT
      left(trim(coalesce(p_query, '')), 300) AS query_text,
      plainto_tsquery('simple'::regconfig, left(trim(coalesce(p_query, '')), 300)) AS query_ts
  ),
  scored AS (
    SELECT
      i.image_url,
      i.post_id,
      i.ocr_text,
      greatest(
        ts_rank_cd(i.ocr_search, input.query_ts),
        similarity(lower(i.ocr_text), lower(input.query_text)) * 0.65
      )::real AS match_score
    FROM public.visual_image_index AS i
    CROSS JOIN input
    WHERE length(input.query_text) >= 2
      AND length(coalesce(i.ocr_text, '')) > 0
      AND (
        i.ocr_search @@ input.query_ts
        OR lower(i.ocr_text) % lower(input.query_text)
      )
  )
  SELECT scored.image_url, scored.post_id, scored.ocr_text, scored.match_score
  FROM scored
  ORDER BY scored.match_score DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100));
$$;

REVOKE ALL ON FUNCTION public.find_visual_text_matches(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_visual_text_matches(text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
