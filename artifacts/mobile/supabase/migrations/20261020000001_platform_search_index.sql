-- Searchable public content is indexed once and queried through one ranked RPC.
-- Private messages, private posts, and private groups are deliberately excluded.

CREATE SCHEMA IF NOT EXISTS search_private;
REVOKE ALL ON SCHEMA search_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS search_private.search_documents (
  source_type text NOT NULL CHECK (source_type IN (
    'profile', 'organization_page', 'post', 'video', 'channel', 'group',
    'event', 'gift', 'job', 'product', 'freelance', 'paid_community', 'music'
  )),
  source_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  popularity double precision NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(body, '')), 'B')
  ) STORED,
  PRIMARY KEY (source_type, source_id)
);

REVOKE ALL ON TABLE search_private.search_documents FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS search_documents_vector_idx
  ON search_private.search_documents USING gin (search_vector);
CREATE INDEX IF NOT EXISTS search_documents_title_trgm_idx
  ON search_private.search_documents USING gin (title public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS search_documents_body_trgm_idx
  ON search_private.search_documents USING gin (body public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS search_documents_created_idx
  ON search_private.search_documents (source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS search_documents_popularity_idx
  ON search_private.search_documents (source_type, popularity DESC);

CREATE OR REPLACE FUNCTION search_private.refresh_public_search_document(
  p_table_name text,
  p_row jsonb,
  p_delete boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, search_private
AS $$
DECLARE
  v_id uuid := nullif(p_row->>'id', '')::uuid;
  v_type text;
  v_title text := '';
  v_body text := '';
  v_created_at timestamptz := coalesce(nullif(p_row->>'created_at', '')::timestamptz, now());
  v_popularity double precision := 0;
  v_is_verified boolean := false;
  v_is_public boolean := true;
BEGIN
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  IF p_table_name = 'posts' THEN
    IF p_delete THEN
      DELETE FROM search_private.search_documents
      WHERE source_id = v_id AND source_type IN ('post', 'video');
      RETURN;
    END IF;
    DELETE FROM search_private.search_documents
    WHERE source_id = v_id AND source_type IN ('post', 'video');

    v_is_public := coalesce(p_row->>'visibility' = 'public', false)
      AND coalesce((p_row->>'is_blocked')::boolean, false) = false;
    IF coalesce(p_row->>'post_type', 'post') = 'video' THEN
      v_type := 'video';
      v_is_public := v_is_public AND nullif(p_row->>'video_url', '') IS NOT NULL;
      v_title := coalesce(nullif(p_row->>'audio_name', ''), nullif(p_row->>'article_title', ''), 'Video');
      v_body := concat_ws(' ', p_row->>'content', p_row->>'audio_name');
    ELSE
      v_type := 'post';
      v_title := coalesce(nullif(p_row->>'article_title', ''), nullif(left(p_row->>'content', 140), ''), 'Post');
      v_body := concat_ws(' ', p_row->>'content', p_row->>'article_title', p_row->>'article_body');
    END IF;
    v_popularity := coalesce(nullif(p_row->>'view_count', '')::double precision, 0);
  ELSE
    CASE p_table_name
      WHEN 'profiles' THEN
        v_type := 'profile';
        v_title := coalesce(nullif(p_row->>'display_name', ''), nullif(p_row->>'handle', ''), 'Profile');
        v_body := concat_ws(
          ' ',
          p_row->>'handle',
          CASE WHEN coalesce((p_row->>'show_bio_publicly')::boolean, true) THEN p_row->>'bio' END
        );
        v_is_public := coalesce((p_row->>'is_private')::boolean, true) = false
          AND coalesce((p_row->>'hide_from_search')::boolean, false) = false
          AND coalesce((p_row->>'account_deleted')::boolean, false) = false
          AND coalesce((p_row->>'is_banned')::boolean, false) = false;
        v_is_verified := coalesce((p_row->>'is_verified')::boolean, false)
          OR coalesce((p_row->>'is_organization_verified')::boolean, false);
        v_popularity := coalesce(nullif(p_row->>'xp', '')::double precision, 0);
      WHEN 'organization_pages' THEN
        v_type := 'organization_page';
        v_title := coalesce(nullif(p_row->>'name', ''), 'Organization');
        v_body := concat_ws(' ', p_row->>'slug', p_row->>'tagline', p_row->>'description', p_row->>'industry', p_row->>'location');
        v_is_verified := coalesce((p_row->>'is_verified')::boolean, false);
        v_popularity := coalesce(nullif(p_row->>'followers_count', '')::double precision, 0);
      WHEN 'channels' THEN
        v_type := 'channel';
        v_title := coalesce(nullif(p_row->>'name', ''), 'Channel');
        v_body := concat_ws(' ', p_row->>'handle', p_row->>'description');
        v_is_public := coalesce((p_row->>'is_public')::boolean, false);
        v_is_verified := coalesce((p_row->>'is_verified')::boolean, false);
        v_popularity := coalesce(nullif(p_row->>'subscriber_count', '')::double precision, 0);
      WHEN 'chats' THEN
        v_type := 'group';
        v_title := coalesce(nullif(p_row->>'name', ''), 'Group');
        v_body := concat_ws(' ', p_row->>'handle', p_row->>'description');
        v_is_public := coalesce((p_row->>'is_group')::boolean, false)
          AND coalesce((p_row->>'is_private')::boolean, true) = false
          AND coalesce((p_row->>'is_channel')::boolean, false) = false;
      WHEN 'digital_events' THEN
        v_type := 'event';
        v_title := coalesce(nullif(p_row->>'title', ''), 'Event');
        v_body := concat_ws(' ', p_row->>'description', p_row->>'category');
          v_is_public := coalesce((p_row->>'is_active')::boolean, false)
          AND coalesce(nullif(p_row->>'event_date', '')::timestamptz >= now(), false);
        v_popularity := coalesce(nullif(p_row->>'tickets_sold', '')::double precision, 0);
      WHEN 'gifts' THEN
        v_type := 'gift';
        v_title := coalesce(nullif(p_row->>'name', ''), 'Gift');
        v_body := concat_ws(' ', p_row->>'description', p_row->>'rarity', p_row->>'season');
      WHEN 'org_page_jobs' THEN
        v_type := 'job';
        v_title := coalesce(nullif(p_row->>'title', ''), 'Job');
        v_body := concat_ws(' ', p_row->>'description', p_row->>'job_type', p_row->>'location');
        v_is_public := coalesce((p_row->>'is_active')::boolean, false);
      WHEN 'shop_products' THEN
        v_type := 'product';
        v_title := coalesce(nullif(p_row->>'name', ''), 'Product');
        v_body := concat_ws(' ', p_row->>'description', p_row->>'category', p_row->>'tags');
        v_is_public := coalesce((p_row->>'is_available')::boolean, false);
        v_popularity := coalesce(nullif(p_row->>'sales_count', '')::double precision, 0);
      WHEN 'freelance_listings' THEN
        v_type := 'freelance';
        v_title := coalesce(nullif(p_row->>'title', ''), 'Freelance service');
        v_body := concat_ws(' ', p_row->>'description', p_row->>'category', p_row->>'tags');
        v_is_public := coalesce((p_row->>'is_active')::boolean, false);
        v_popularity := coalesce(nullif(p_row->>'orders_count', '')::double precision, 0);
      WHEN 'paid_communities' THEN
        v_type := 'paid_community';
        v_title := coalesce(nullif(p_row->>'name', ''), 'Community');
        v_body := concat_ws(' ', p_row->>'description', p_row->>'tags');
         v_is_public := coalesce((p_row->>'is_active')::boolean, false);
        v_popularity := coalesce(nullif(p_row->>'member_count', '')::double precision, 0);
      WHEN 'music_tracks' THEN
        v_type := 'music';
        v_title := coalesce(nullif(p_row->>'title', ''), 'Track');
        v_body := concat_ws(' ', p_row->>'artist', p_row->>'genre');
        v_is_public := coalesce(p_row->>'status' = 'published', false);
        v_popularity := coalesce(nullif(p_row->>'play_count', '')::double precision, nullif(p_row->>'usage_count', '')::double precision, 0);
      ELSE
        RETURN;
    END CASE;

    IF p_delete THEN
      DELETE FROM search_private.search_documents
      WHERE source_type = v_type AND source_id = v_id;
      RETURN;
    END IF;
    DELETE FROM search_private.search_documents
    WHERE source_type = v_type AND source_id = v_id;
  END IF;

  IF NOT v_is_public OR v_type IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO search_private.search_documents (
    source_type, source_id, title, body, created_at, popularity, is_verified
  )
  VALUES (
    v_type, v_id, coalesce(v_title, ''), coalesce(v_body, ''),
    v_created_at, v_popularity, v_is_verified
  )
  ON CONFLICT (source_type, source_id) DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    created_at = EXCLUDED.created_at,
    popularity = EXCLUDED.popularity,
    is_verified = EXCLUDED.is_verified;
END;
$$;

REVOKE ALL ON FUNCTION search_private.refresh_public_search_document(text, jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION search_private.sync_public_search_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, search_private
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_private.refresh_public_search_document(TG_TABLE_NAME, to_jsonb(OLD), true);
    RETURN OLD;
  END IF;
  PERFORM search_private.refresh_public_search_document(TG_TABLE_NAME, to_jsonb(NEW), false);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION search_private.sync_public_search_document() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS search_document_sync ON public.profiles;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF display_name, handle, bio, is_private, show_bio_publicly, hide_from_search, account_deleted, is_banned, is_verified, is_organization_verified OR DELETE
ON public.profiles FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.posts;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF content, article_title, article_body, post_type, visibility, video_url, is_blocked, created_at OR DELETE
ON public.posts FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.organization_pages;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF name, slug, tagline, description, industry, location, is_verified, followers_count, created_at OR DELETE
ON public.organization_pages FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.channels;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF name, description, handle, is_public, is_verified, created_at OR DELETE
ON public.channels FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.chats;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF name, description, handle, is_group, is_private, is_channel, created_at OR DELETE
ON public.chats FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.digital_events;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF title, description, category, event_date, is_active, created_at OR DELETE
ON public.digital_events FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.gifts;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF name, description, rarity, season, available_from, available_until, created_at OR DELETE
ON public.gifts FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.shop_products;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF name, description, category, tags, is_available, created_at OR DELETE
ON public.shop_products FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.freelance_listings;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF title, description, category, tags, is_active, created_at OR DELETE
ON public.freelance_listings FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.paid_communities;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF name, description, tags, is_active, created_at OR DELETE
ON public.paid_communities FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

DROP TRIGGER IF EXISTS search_document_sync ON public.music_tracks;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF title, artist, genre, status, created_at OR DELETE
ON public.music_tracks FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_document();

-- Keep sort-by-popularity current without rebuilding the full-text vector for view/count changes.
CREATE OR REPLACE FUNCTION search_private.sync_public_search_popularity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, search_private
AS $$
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    UPDATE search_private.search_documents SET popularity = coalesce(NEW.xp, 0)
    WHERE source_type = 'profile' AND source_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'posts' THEN
    UPDATE search_private.search_documents SET popularity = coalesce(NEW.view_count, 0)
    WHERE source_type IN ('post', 'video') AND source_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'channels' THEN
    UPDATE search_private.search_documents SET popularity = coalesce(NEW.subscriber_count, 0)
    WHERE source_type = 'channel' AND source_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'digital_events' THEN
    UPDATE search_private.search_documents SET popularity = coalesce(NEW.tickets_sold, 0)
    WHERE source_type = 'event' AND source_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'shop_products' THEN
    UPDATE search_private.search_documents SET popularity = coalesce(NEW.sales_count, 0)
    WHERE source_type = 'product' AND source_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'freelance_listings' THEN
    UPDATE search_private.search_documents SET popularity = coalesce(NEW.orders_count, 0)
    WHERE source_type = 'freelance' AND source_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'paid_communities' THEN
    UPDATE search_private.search_documents SET popularity = coalesce(NEW.member_count, 0)
    WHERE source_type = 'paid_community' AND source_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'music_tracks' THEN
    UPDATE search_private.search_documents
    SET popularity = coalesce(NEW.play_count, NEW.usage_count, 0)
    WHERE source_type = 'music' AND source_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION search_private.sync_public_search_popularity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS search_document_popularity_sync ON public.profiles;
CREATE TRIGGER search_document_popularity_sync
AFTER UPDATE OF xp ON public.profiles
FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_popularity();

DROP TRIGGER IF EXISTS search_document_popularity_sync ON public.posts;
CREATE TRIGGER search_document_popularity_sync
AFTER UPDATE OF view_count ON public.posts
FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_popularity();

DROP TRIGGER IF EXISTS search_document_popularity_sync ON public.channels;
CREATE TRIGGER search_document_popularity_sync
AFTER UPDATE OF subscriber_count ON public.channels
FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_popularity();

DROP TRIGGER IF EXISTS search_document_popularity_sync ON public.digital_events;
CREATE TRIGGER search_document_popularity_sync
AFTER UPDATE OF tickets_sold ON public.digital_events
FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_popularity();

DROP TRIGGER IF EXISTS search_document_popularity_sync ON public.shop_products;
CREATE TRIGGER search_document_popularity_sync
AFTER UPDATE OF sales_count ON public.shop_products
FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_popularity();

DROP TRIGGER IF EXISTS search_document_popularity_sync ON public.freelance_listings;
CREATE TRIGGER search_document_popularity_sync
AFTER UPDATE OF orders_count ON public.freelance_listings
FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_popularity();

DROP TRIGGER IF EXISTS search_document_popularity_sync ON public.paid_communities;
CREATE TRIGGER search_document_popularity_sync
AFTER UPDATE OF member_count ON public.paid_communities
FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_popularity();

DROP TRIGGER IF EXISTS search_document_popularity_sync ON public.music_tracks;
CREATE TRIGGER search_document_popularity_sync
AFTER UPDATE OF play_count, usage_count ON public.music_tracks
FOR EACH ROW EXECUTE FUNCTION search_private.sync_public_search_popularity();

CREATE OR REPLACE FUNCTION public.search_public_content(
  p_query text,
  p_types text[] DEFAULT NULL,
  p_limit_per_type integer DEFAULT 25,
  p_since timestamptz DEFAULT NULL,
  p_verified_only boolean DEFAULT false,
  p_sort_mode text DEFAULT 'relevance'
)
RETURNS TABLE (source_type text, source_id uuid, score real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, search_private
SET pg_trgm.similarity_threshold = '0.12'
AS $$
  WITH input AS (
    SELECT
      regexp_replace(
        lower(btrim(regexp_replace(normalize(coalesce(p_query, ''), NFKC), '[[:cntrl:]]', ' ', 'g'))),
        '^[#@]+',
        ''
      ) AS query_text,
      least(greatest(coalesce(p_limit_per_type, 25), 1), 50) AS result_limit
  ),
  scored AS (
    SELECT
      d.source_type,
      d.source_id,
      d.created_at,
      d.popularity,
      (
        CASE WHEN lower(d.title) = i.query_text AND i.query_text <> '' THEN 10.0 ELSE 0.0 END
        + CASE WHEN lower(d.title) LIKE i.query_text || '%' AND i.query_text <> '' THEN 3.0 ELSE 0.0 END
        + CASE WHEN i.query_text = '' THEN 0.0
          ELSE ts_rank_cd(d.search_vector, websearch_to_tsquery('simple'::regconfig, i.query_text)) * 4.0
            + greatest(public.similarity(d.title, i.query_text), public.similarity(d.body, i.query_text))
          END
      )::real AS relevance_score
    FROM search_private.search_documents AS d
    CROSS JOIN input AS i
    WHERE auth.uid() IS NOT NULL
      AND (p_types IS NULL OR d.source_type = ANY(p_types))
      AND (p_since IS NULL OR d.created_at >= p_since)
      AND (NOT coalesce(p_verified_only, false) OR d.source_type <> 'profile' OR d.is_verified)
      AND (
        i.query_text = ''
        OR d.search_vector @@ websearch_to_tsquery('simple'::regconfig, i.query_text)
        OR d.title ILIKE '%' || replace(replace(replace(i.query_text, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
        OR d.body ILIKE '%' || replace(replace(replace(i.query_text, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
      )
  ),
  ranked AS (
    SELECT
      scored.source_type,
      scored.source_id,
      scored.relevance_score,
      row_number() OVER (
        PARTITION BY scored.source_type
        ORDER BY
          CASE WHEN p_sort_mode = 'popular' THEN scored.popularity END DESC NULLS LAST,
          CASE WHEN p_sort_mode = 'recent' THEN scored.created_at END DESC NULLS LAST,
          scored.relevance_score DESC,
          scored.created_at DESC NULLS LAST
      ) AS type_rank,
      input.result_limit
    FROM scored
    CROSS JOIN input
  )
  SELECT ranked.source_type, ranked.source_id, ranked.relevance_score
  FROM ranked
  WHERE ranked.type_rank <= ranked.result_limit
  ORDER BY ranked.source_type, ranked.type_rank;
$$;

REVOKE ALL ON FUNCTION public.search_public_content(text, text[], integer, timestamptz, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_content(text, text[], integer, timestamptz, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_search_profiles(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  bio text,
  show_bio_publicly boolean,
  is_private boolean,
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
  SELECT
    p.id,
    p.handle,
    p.display_name,
    p.avatar_url,
    CASE WHEN coalesce(p.show_bio_publicly, true) THEN p.bio ELSE NULL END,
    coalesce(p.show_bio_publicly, true),
    coalesce(p.is_private, false),
    coalesce(p.is_verified, false),
    coalesce(p.is_organization_verified, false),
    p.current_grade,
    p.country,
    p.xp
  FROM public.profiles AS p
  WHERE p.id = ANY(coalesce(p_ids, ARRAY[]::uuid[]))
    AND p.is_private = false
    AND coalesce(p.hide_from_search, false) = false
    AND coalesce(p.account_deleted, false) = false
    AND coalesce(p.is_banned, false) = false;
$$;

REVOKE ALL ON FUNCTION public.get_public_search_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_search_profiles(uuid[]) TO authenticated;

-- Existing profile autocomplete/search functions also obey the public-only rule.
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
  is_private boolean,
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
    SELECT lower(btrim(regexp_replace(
      regexp_replace(normalize(coalesce(p_query, ''), NFKC), '[[:cntrl:]]', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    ))) AS full_query
  ),
  prepared AS (
    SELECT full_query, regexp_replace(full_query, '^@+', '') AS handle_query
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
    coalesce(p.is_private, false),
    coalesce(p.is_verified, false),
    coalesce(p.is_organization_verified, false),
    p.current_grade,
    p.country,
    p.xp
  FROM public.profiles AS p
  CROSS JOIN escaped AS q
  WHERE q.full_query <> ''
    AND coalesce(p.hide_from_search, false) = false
    AND p.is_private = false
    AND coalesce(p.account_deleted, false) = false
    AND coalesce(p.is_banned, false) = false
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
    SELECT lower(btrim(regexp_replace(
      regexp_replace(normalize(coalesce(p_query, ''), NFKC), '[[:cntrl:]]', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    ))) AS full_query
  ),
  prepared AS (
    SELECT full_query, regexp_replace(full_query, '^@+', '') AS prefix
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
    coalesce(p.is_verified, false),
    coalesce(p.is_organization_verified, false)
  FROM public.profiles AS p
  CROSS JOIN escaped AS q
  WHERE q.full_query NOT LIKE '#%'
    AND char_length(q.prefix) >= 2
    AND coalesce(p.hide_from_search, false) = false
    AND p.is_private = false
    AND coalesce(p.account_deleted, false) = false
    AND coalesce(p.is_banned, false) = false
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

DO $$
BEGIN
  PERFORM search_private.refresh_public_search_document('profiles', to_jsonb(source_row), false) FROM public.profiles AS source_row;
  PERFORM search_private.refresh_public_search_document('posts', to_jsonb(source_row), false) FROM public.posts AS source_row;
  PERFORM search_private.refresh_public_search_document('organization_pages', to_jsonb(source_row), false) FROM public.organization_pages AS source_row;
  PERFORM search_private.refresh_public_search_document('channels', to_jsonb(source_row), false) FROM public.channels AS source_row;
  PERFORM search_private.refresh_public_search_document('chats', to_jsonb(source_row), false) FROM public.chats AS source_row;
  PERFORM search_private.refresh_public_search_document('digital_events', to_jsonb(source_row), false) FROM public.digital_events AS source_row;
  PERFORM search_private.refresh_public_search_document('gifts', to_jsonb(source_row), false) FROM public.gifts AS source_row;
  PERFORM search_private.refresh_public_search_document('shop_products', to_jsonb(source_row), false) FROM public.shop_products AS source_row;
  PERFORM search_private.refresh_public_search_document('freelance_listings', to_jsonb(source_row), false) FROM public.freelance_listings AS source_row;
  PERFORM search_private.refresh_public_search_document('paid_communities', to_jsonb(source_row), false) FROM public.paid_communities AS source_row;
  PERFORM search_private.refresh_public_search_document('music_tracks', to_jsonb(source_row), false) FROM public.music_tracks AS source_row;
END;
$$;
