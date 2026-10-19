-- Shared, privacy-aware AfuChat search suggestions. Raw keystrokes are never
-- written; clients call record_search_submission only after an explicit search.

CREATE SCHEMA IF NOT EXISTS search_private;
REVOKE ALL ON SCHEMA search_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS search_private.search_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  hash_salt text NOT NULL,
  last_pruned_on date NOT NULL DEFAULT DATE '1970-01-01'
);

INSERT INTO search_private.search_config (singleton, hash_salt)
VALUES (true, md5(gen_random_uuid()::text || ':' || gen_random_uuid()::text))
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS search_private.search_term_daily_stats (
  normalized_term text NOT NULL,
  search_day date NOT NULL,
  display_term text NOT NULL,
  unique_searchers integer NOT NULL DEFAULT 0 CHECK (unique_searchers >= 0),
  engaged_searchers integer NOT NULL DEFAULT 0 CHECK (engaged_searchers >= 0),
  PRIMARY KEY (normalized_term, search_day)
);

CREATE INDEX IF NOT EXISTS search_term_daily_prefix_idx
  ON search_private.search_term_daily_stats (normalized_term text_pattern_ops, search_day DESC);
CREATE INDEX IF NOT EXISTS search_term_daily_recent_idx
  ON search_private.search_term_daily_stats (search_day DESC, normalized_term);
CREATE INDEX IF NOT EXISTS search_term_daily_trigram_idx
  ON search_private.search_term_daily_stats USING gin (normalized_term public.gin_trgm_ops);

CREATE TABLE IF NOT EXISTS search_private.search_term_contributors (
  normalized_term text NOT NULL,
  contributor_hash text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_submitted_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_counted_on date NOT NULL,
  last_engaged_on date,
  PRIMARY KEY (normalized_term, contributor_hash)
);

CREATE INDEX IF NOT EXISTS search_term_contributors_expiry_idx
  ON search_private.search_term_contributors (last_submitted_at);

CREATE TABLE IF NOT EXISTS search_private.search_rate_limits (
  daily_hash text NOT NULL,
  search_day date NOT NULL,
  distinct_terms smallint NOT NULL DEFAULT 0 CHECK (distinct_terms >= 0 AND distinct_terms <= 20),
  PRIMARY KEY (daily_hash, search_day)
);

ALTER TABLE search_private.search_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_private.search_term_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_private.search_term_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_private.search_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA search_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA search_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION search_private.normalize_term(p_query text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT lower(
    btrim(
      regexp_replace(
        regexp_replace(normalize(coalesce(p_query, ''), NFC), '[[:cntrl:]]', ' ', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION search_private.normalize_term(text) FROM PUBLIC, anon, authenticated;

-- Prefix indexes serve live profile suggestions; trigram indexes accelerate
-- the existing substring search for profiles and public posts.
CREATE INDEX IF NOT EXISTS profiles_handle_lower_prefix_idx
  ON public.profiles (lower(handle) text_pattern_ops);
CREATE INDEX IF NOT EXISTS profiles_display_name_lower_prefix_idx
  ON public.profiles (lower(display_name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS profiles_handle_search_trigram_idx
  ON public.profiles USING gin (handle public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_display_name_search_trigram_idx
  ON public.profiles USING gin (display_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_bio_search_trigram_idx
  ON public.profiles USING gin (bio public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS posts_public_content_search_trigram_idx
  ON public.posts USING gin (content public.gin_trgm_ops)
  WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS posts_public_article_title_search_trigram_idx
  ON public.posts USING gin (article_title public.gin_trgm_ops)
  WHERE visibility = 'public' AND article_title IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_public_discovery_recent_idx
  ON public.posts (created_at DESC)
  WHERE visibility = 'public';

CREATE OR REPLACE FUNCTION public.search_profiles(
  p_query text,
  p_verified_only boolean DEFAULT false,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  bio text,
  show_bio_publicly boolean,
  is_verified boolean,
  is_organization_verified boolean,
  current_grade text,
  country text,
  xp integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH normalized AS (
    SELECT
      lower(btrim(regexp_replace(
        regexp_replace(normalize(coalesce(p_query, ''), NFC), '[[:cntrl:]]', ' ', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      ))) AS full_query
  ),
  prepared AS (
    SELECT
      full_query,
      regexp_replace(full_query, '^@+', '') AS handle_query
    FROM normalized
  ),
  escaped AS (
    SELECT
      full_query,
      handle_query,
      replace(replace(replace(full_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') AS full_pattern,
      replace(replace(replace(handle_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') AS handle_pattern
    FROM prepared
  )
  SELECT
    p.id,
    p.handle,
    p.display_name,
    p.avatar_url,
    CASE WHEN coalesce(p.show_bio_publicly, true) THEN p.bio ELSE NULL END,
    coalesce(p.show_bio_publicly, true),
    p.is_verified,
    p.is_organization_verified,
    p.current_grade,
    p.country,
    p.xp
  FROM public.profiles AS p
  CROSS JOIN escaped AS q
  WHERE q.full_query <> ''
    AND coalesce(p.hide_from_search, false) = false
    AND (NOT coalesce(p_verified_only, false) OR p.is_verified = true)
    AND (
      lower(p.handle) LIKE '%' || q.handle_pattern || '%' ESCAPE E'\\'
      OR lower(p.display_name) LIKE '%' || q.full_pattern || '%' ESCAPE E'\\'
      OR (
        coalesce(p.show_bio_publicly, true)
        AND lower(coalesce(p.bio, '')) LIKE '%' || q.full_pattern || '%' ESCAPE E'\\'
      )
    )
  ORDER BY
    (lower(p.handle) = q.handle_query) DESC,
    (lower(p.display_name) = q.full_query) DESC,
    (lower(p.handle) LIKE q.handle_pattern || '%' ESCAPE E'\\') DESC,
    (lower(p.display_name) LIKE q.full_pattern || '%' ESCAPE E'\\') DESC,
    p.xp DESC
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_profiles(text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_profiles(text, boolean, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ranked_search_suggestions(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 8,
  p_include_similar boolean DEFAULT false
)
RETURNS TABLE (
  term text,
  score double precision,
  growth double precision,
  engagement_rate double precision,
  exact_match boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET pg_trgm.similarity_threshold = '0.25'
AS $$
DECLARE
  v_query text := search_private.normalize_term(coalesce(p_query, ''));
  v_core text;
  v_escaped text;
  v_day date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  v_core := regexp_replace(v_query, '^[#@]+', '');
  IF v_query <> '' AND char_length(v_core) < 2 THEN
    RETURN;
  END IF;

  v_escaped := replace(
    replace(
      replace(v_query, E'\\', E'\\\\'),
      '%', E'\\%'
    ),
    '_', E'\\_'
  );

  RETURN QUERY
  WITH aggregate_terms AS (
    SELECT
      d.normalized_term,
      (array_agg(d.display_term ORDER BY d.search_day DESC))[1] AS display_term,
      coalesce(sum(d.unique_searchers) FILTER (WHERE d.search_day >= v_day - 6), 0)::numeric AS searches_7d,
      coalesce(sum(d.unique_searchers) FILTER (WHERE d.search_day >= v_day - 2), 0)::numeric AS searches_3d,
      coalesce(sum(d.unique_searchers) FILTER (WHERE d.search_day BETWEEN v_day - 9 AND v_day - 3), 0)::numeric AS searches_previous_7d,
      coalesce(sum(d.engaged_searchers) FILTER (WHERE d.search_day >= v_day - 6), 0)::numeric AS engaged_7d,
      max(d.search_day) AS last_seen
    FROM search_private.search_term_daily_stats AS d
    WHERE d.search_day >= v_day - 13
      AND (
        v_query = ''
        OR d.normalized_term LIKE v_escaped || '%' ESCAPE E'\\'
        OR (
          coalesce(p_include_similar, false)
          AND char_length(v_core) >= 3
          AND d.normalized_term % v_query
        )
      )
    GROUP BY d.normalized_term
  ),
  scored AS (
    SELECT
      a.*,
      CASE
        WHEN a.searches_previous_7d <= 0 AND a.searches_3d > 0 THEN 3.0::numeric
        WHEN a.searches_previous_7d <= 0 THEN 0.0::numeric
        ELSE
          (a.searches_3d / 3.0 - a.searches_previous_7d / 7.0)
          / greatest(a.searches_previous_7d / 7.0, 0.5)
      END AS growth_rate,
      least(a.engaged_7d / greatest(a.searches_7d, 1), 1.0) AS engagement_rate
    FROM aggregate_terms AS a
    WHERE a.searches_7d >= 3
  )
  SELECT
    s.display_term,
    (
      CASE WHEN v_query <> '' AND s.normalized_term = v_query THEN 1000.0 ELSE 0.0 END
      + CASE
          WHEN v_query = '' THEN 0.0
          WHEN s.normalized_term = v_query THEN 100.0
          WHEN s.normalized_term LIKE v_escaped || '%' ESCAPE E'\\' THEN 25.0
          ELSE similarity(s.normalized_term, v_query) * 20.0
        END
      + ln(1.0 + s.searches_7d) * 8.0
      + least(greatest(s.growth_rate, 0.0), 3.0) * 15.0
      + s.engagement_rate * 18.0
      + CASE
          WHEN s.last_seen >= v_day THEN 3.0
          WHEN s.last_seen >= v_day - 2 THEN 1.5
          ELSE 0.0
        END
    )::double precision,
    s.growth_rate::double precision,
    s.engagement_rate::double precision,
    (v_query <> '' AND s.normalized_term = v_query)
  FROM scored AS s
  ORDER BY
    (v_query <> '' AND s.normalized_term = v_query) DESC,
    (
      CASE WHEN v_query <> '' AND s.normalized_term = v_query THEN 1000.0 ELSE 0.0 END
      + CASE
          WHEN v_query = '' THEN 0.0
          WHEN s.normalized_term = v_query THEN 100.0
          WHEN s.normalized_term LIKE v_escaped || '%' ESCAPE E'\\' THEN 25.0
          ELSE similarity(s.normalized_term, v_query) * 20.0
        END
      + ln(1.0 + s.searches_7d) * 8.0
      + least(greatest(s.growth_rate, 0.0), 3.0) * 15.0
      + s.engagement_rate * 18.0
      + CASE
          WHEN s.last_seen >= v_day THEN 3.0
          WHEN s.last_seen >= v_day - 2 THEN 1.5
          ELSE 0.0
        END
    ) DESC,
    s.searches_7d DESC,
    s.normalized_term
  LIMIT least(greatest(coalesce(p_limit, 8), 1), 10);
END;
$$;

REVOKE ALL ON FUNCTION public.get_ranked_search_suggestions(text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranked_search_suggestions(text, integer, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_search_profile_suggestions(
  p_query text,
  p_limit integer DEFAULT 4
)
RETURNS TABLE (
  profile_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  is_organization_verified boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH normalized AS (
    SELECT
      lower(btrim(regexp_replace(
        regexp_replace(normalize(coalesce(p_query, ''), NFC), '[[:cntrl:]]', ' ', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      ))) AS full_query
  ),
  prepared AS (
    SELECT
      full_query,
      regexp_replace(full_query, '^@+', '') AS prefix
    FROM normalized
  ),
  escaped AS (
    SELECT
      full_query,
      prefix,
      replace(replace(replace(prefix, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') AS prefix_pattern
    FROM prepared
  )
  SELECT
    p.id,
    p.handle,
    p.display_name,
    p.avatar_url,
    p.is_verified,
    p.is_organization_verified
  FROM public.profiles AS p
  CROSS JOIN escaped AS q
  WHERE q.full_query NOT LIKE '#%'
    AND char_length(q.prefix) >= 2
    AND coalesce(p.hide_from_search, false) = false
    AND (
      lower(p.handle) LIKE q.prefix_pattern || '%' ESCAPE E'\\'
      OR lower(p.display_name) LIKE q.prefix_pattern || '%' ESCAPE E'\\'
    )
  ORDER BY
    (lower(p.handle) = q.prefix) DESC,
    (lower(p.display_name) = q.prefix) DESC,
    p.created_at DESC,
    p.is_verified DESC
  LIMIT least(greatest(coalesce(p_limit, 4), 1), 8);
$$;

REVOKE ALL ON FUNCTION public.get_search_profile_suggestions(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_search_profile_suggestions(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_search_submission(
  p_query text,
  p_result_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_analytics_enabled boolean;
  v_display text;
  v_term text;
  v_core text;
  v_day date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
  v_salt text;
  v_contributor_hash text;
  v_daily_hash text;
  v_last_counted_on date;
  v_rate_count smallint;
  v_counted boolean;
  v_pruned_on date;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('analytics_enabled', false, 'indexed', false);
  END IF;

  SELECT coalesce(p.data_analytics, true)
    INTO v_analytics_enabled
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  IF NOT FOUND OR NOT v_analytics_enabled THEN
    RETURN jsonb_build_object('analytics_enabled', false, 'indexed', false);
  END IF;

  v_display := btrim(regexp_replace(
    regexp_replace(normalize(coalesce(p_query, ''), NFC), '[[:cntrl:]]', ' ', 'g'),
    '[[:space:]]+',
    ' ',
    'g'
  ));
  v_term := search_private.normalize_term(v_display);
  v_core := regexp_replace(v_term, '^[#@]+', '');

  IF coalesce(p_result_count, 0) <= 0
    OR char_length(v_term) < 2
    OR char_length(v_term) > 64
    OR char_length(v_core) < 2
    OR array_length(regexp_split_to_array(v_term, ' '), 1) > 5
    OR v_term !~ '[[:alpha:]]'
    OR v_term ~ '^(https?://|www\.)'
    OR v_term ~ '^[^[:space:]]+@[^[:space:]]+\.[^[:space:]]+$'
    OR v_term ~ '(.)\1{6,}'
  THEN
    RETURN jsonb_build_object('analytics_enabled', true, 'indexed', false);
  END IF;

  SELECT c.hash_salt, c.last_pruned_on
    INTO v_salt, v_pruned_on
  FROM search_private.search_config AS c
  WHERE c.singleton = true;

  v_contributor_hash := md5(v_salt || ':' || v_user_id::text || ':' || v_term);
  v_daily_hash := md5(v_salt || ':' || v_user_id::text || ':' || v_day::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_daily_hash, 0));

  SELECT c.last_counted_on
    INTO v_last_counted_on
  FROM search_private.search_term_contributors AS c
  WHERE c.normalized_term = v_term
    AND c.contributor_hash = v_contributor_hash
  FOR UPDATE;

  IF FOUND THEN
    UPDATE search_private.search_term_contributors
    SET last_submitted_at = statement_timestamp()
    WHERE normalized_term = v_term
      AND contributor_hash = v_contributor_hash;

    IF v_last_counted_on >= v_day - 6 THEN
      RETURN jsonb_build_object(
        'analytics_enabled', true,
        'indexed', false,
        'deduplicated', true
      );
    END IF;
  END IF;

  INSERT INTO search_private.search_rate_limits (daily_hash, search_day, distinct_terms)
  VALUES (v_daily_hash, v_day, 1)
  ON CONFLICT (daily_hash, search_day)
  DO UPDATE SET distinct_terms = search_private.search_rate_limits.distinct_terms + 1
  WHERE search_private.search_rate_limits.distinct_terms < 20
  RETURNING distinct_terms INTO v_rate_count;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'analytics_enabled', true,
      'indexed', false,
      'rate_limited', true
    );
  END IF;

  INSERT INTO search_private.search_term_contributors (
    normalized_term,
    contributor_hash,
    last_counted_on,
    last_submitted_at
  )
  VALUES (v_term, v_contributor_hash, v_day, statement_timestamp())
  ON CONFLICT (normalized_term, contributor_hash)
  DO UPDATE SET
    last_counted_on = EXCLUDED.last_counted_on,
    last_submitted_at = EXCLUDED.last_submitted_at
  WHERE search_private.search_term_contributors.last_counted_on < v_day - 6
  RETURNING true INTO v_counted;

  IF NOT coalesce(v_counted, false) THEN
    RETURN jsonb_build_object(
      'analytics_enabled', true,
      'indexed', false,
      'deduplicated', true
    );
  END IF;

  INSERT INTO search_private.search_term_daily_stats (
    normalized_term,
    search_day,
    display_term,
    unique_searchers,
    engaged_searchers
  )
  VALUES (v_term, v_day, v_display, 1, 0)
  ON CONFLICT (normalized_term, search_day)
  DO UPDATE SET
    display_term = CASE
      WHEN search_private.search_term_daily_stats.display_term = search_private.search_term_daily_stats.normalized_term
        AND EXCLUDED.display_term <> EXCLUDED.normalized_term
      THEN EXCLUDED.display_term
      ELSE search_private.search_term_daily_stats.display_term
    END,
    unique_searchers = search_private.search_term_daily_stats.unique_searchers + 1;

  IF v_pruned_on < v_day
    AND pg_try_advisory_xact_lock(871203764512345::bigint)
  THEN
    DELETE FROM search_private.search_term_daily_stats
    WHERE search_day < v_day - 60;

    DELETE FROM search_private.search_term_contributors
    WHERE last_submitted_at < statement_timestamp() - interval '90 days';

    DELETE FROM search_private.search_rate_limits
    WHERE search_day < v_day - 30;

    UPDATE search_private.search_config
    SET last_pruned_on = v_day
    WHERE singleton = true
      AND last_pruned_on < v_day;
  END IF;

  RETURN jsonb_build_object('analytics_enabled', true, 'indexed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_search_submission(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_search_submission(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_search_result_engagement(p_query text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_analytics_enabled boolean;
  v_term text := search_private.normalize_term(coalesce(p_query, ''));
  v_core text;
  v_day date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
  v_salt text;
  v_contributor_hash text;
  v_display text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT coalesce(p.data_analytics, true)
    INTO v_analytics_enabled
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  IF NOT FOUND OR NOT v_analytics_enabled THEN
    RETURN false;
  END IF;

  v_core := regexp_replace(v_term, '^[#@]+', '');
  IF char_length(v_core) < 2 OR char_length(v_term) > 64 THEN
    RETURN false;
  END IF;

  SELECT c.hash_salt INTO v_salt
  FROM search_private.search_config AS c
  WHERE c.singleton = true;

  v_contributor_hash := md5(v_salt || ':' || v_user_id::text || ':' || v_term);

  UPDATE search_private.search_term_contributors AS c
  SET last_engaged_on = v_day
  WHERE c.normalized_term = v_term
    AND c.contributor_hash = v_contributor_hash
    AND c.last_submitted_at >= statement_timestamp() - interval '24 hours'
    AND (c.last_engaged_on IS NULL OR c.last_engaged_on < v_day);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT d.display_term INTO v_display
  FROM search_private.search_term_daily_stats AS d
  WHERE d.normalized_term = v_term
  ORDER BY d.search_day DESC
  LIMIT 1;

  INSERT INTO search_private.search_term_daily_stats (
    normalized_term,
    search_day,
    display_term,
    unique_searchers,
    engaged_searchers
  )
  VALUES (v_term, v_day, coalesce(v_display, v_term), 0, 1)
  ON CONFLICT (normalized_term, search_day)
  DO UPDATE SET
    engaged_searchers = search_private.search_term_daily_stats.engaged_searchers + 1;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_search_result_engagement(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_search_result_engagement(text) TO authenticated;
