-- AfuSearch OCR-backed text-in-image search using traditional OCR and SQL only.
-- No AI models, embeddings, or generated descriptions are used.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

ALTER TABLE public.visual_image_index
  ADD COLUMN IF NOT EXISTS ocr_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ocr_processed_at timestamptz;

ALTER TABLE public.visual_image_index
  ADD COLUMN IF NOT EXISTS ocr_search tsvector
  GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce(ocr_text, ''))) STORED;

CREATE INDEX IF NOT EXISTS visual_image_index_ocr_search_idx
  ON public.visual_image_index USING gin (ocr_search);
CREATE INDEX IF NOT EXISTS visual_image_index_ocr_trgm_idx
  ON public.visual_image_index USING gin (lower(ocr_text) public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS visual_image_index_ocr_pending_idx
  ON public.visual_image_index (indexed_at)
  WHERE ocr_processed_at IS NULL;

-- Search words detected inside indexed images, including tolerant near-keyword matches.
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
SET search_path = pg_catalog, public
AS $$
  WITH input AS (
    SELECT
      left(trim(coalesce(p_query, '')), 300) AS query_text,
      plainto_tsquery('simple'::regconfig, left(trim(coalesce(p_query, '')), 300)) AS query_ts,
      to_tsquery(
        'simple'::regconfig,
        coalesce(nullif((
          SELECT string_agg(tokens.token || ':*', ' | ' ORDER BY length(tokens.token) DESC)
          FROM (
            SELECT token
            FROM regexp_split_to_table(lower(left(trim(coalesce(p_query, '')), 300)), '[^[:alnum:]]+') AS token
            WHERE length(token) >= 3
            GROUP BY token
            ORDER BY length(token) DESC
            LIMIT 8
          ) AS tokens
        ), ''), 'afusearchnoquerytoken:*')
      ) AS query_or_ts
  ),
  scored AS (
    SELECT
      i.image_url,
      i.post_id,
      i.ocr_text,
      greatest(
        ts_rank_cd(i.ocr_search, input.query_ts),
        ts_rank_cd(i.ocr_search, input.query_or_ts),
        similarity(lower(i.ocr_text), lower(input.query_text)) * 0.65
      )::real AS match_score
    FROM public.visual_image_index AS i
    CROSS JOIN input
    WHERE length(input.query_text) >= 2
      AND length(coalesce(i.ocr_text, '')) > 0
      AND (
        i.ocr_search @@ input.query_ts
        OR i.ocr_search @@ input.query_or_ts
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

-- Reuse AfuChat's permission-filtered public search corpus so OCR words can find
-- posts, profiles, products, jobs, events, music, channels, and other indexed content.
CREATE OR REPLACE FUNCTION public.find_public_content_text_matches(
  p_query text,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  source_type text,
  source_id uuid,
  title text,
  body text,
  created_at timestamptz,
  score real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, search_private
AS $$
  WITH input AS (
    SELECT
      left(trim(coalesce(p_query, '')), 300) AS query_text,
      plainto_tsquery('simple'::regconfig, left(trim(coalesce(p_query, '')), 300)) AS query_ts,
      to_tsquery(
        'simple'::regconfig,
        coalesce(nullif((
          SELECT string_agg(tokens.token || ':*', ' | ' ORDER BY length(tokens.token) DESC)
          FROM (
            SELECT token
            FROM regexp_split_to_table(lower(left(trim(coalesce(p_query, '')), 300)), '[^[:alnum:]]+') AS token
            WHERE length(token) >= 3
            GROUP BY token
            ORDER BY length(token) DESC
            LIMIT 8
          ) AS tokens
        ), ''), 'afusearchnoquerytoken:*')
      ) AS query_or_ts
  ),
  scored AS (
    SELECT
      d.source_type,
      d.source_id,
      d.title,
      d.body,
      d.created_at,
      greatest(
        ts_rank_cd(d.search_vector, input.query_ts),
        ts_rank_cd(d.search_vector, input.query_or_ts),
        similarity(lower(d.title || ' ' || d.body), lower(input.query_text)) * 0.65
      )::real AS match_score
    FROM search_private.search_documents AS d
    CROSS JOIN input
    WHERE length(input.query_text) >= 2
      AND (
        d.search_vector @@ input.query_ts
        OR d.search_vector @@ input.query_or_ts
        OR lower(d.title) % lower(input.query_text)
        OR lower(d.body) % lower(input.query_text)
      )
  )
  SELECT scored.source_type, scored.source_id, scored.title, scored.body, scored.created_at, scored.match_score
  FROM scored
  ORDER BY scored.match_score DESC, scored.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100));
$$;

REVOKE ALL ON FUNCTION public.find_public_content_text_matches(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_public_content_text_matches(text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
