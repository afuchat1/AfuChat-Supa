-- Extend AfuSearch suggestions to public platform content, music artists/tracks, and app features.
-- Search submissions remain the only source of shared search-popularity signals.

ALTER TABLE search_private.search_documents
  DROP CONSTRAINT IF EXISTS search_documents_source_type_check;

ALTER TABLE search_private.search_documents
  ADD CONSTRAINT search_documents_source_type_check CHECK (source_type IN (
    'profile', 'organization_page', 'post', 'video', 'channel', 'group',
    'event', 'gift', 'job', 'product', 'freelance', 'paid_community', 'music',
    'feature'
  ));

ALTER TABLE search_private.search_documents
  ADD COLUMN IF NOT EXISTS artist_name text,
  ADD COLUMN IF NOT EXISTS target_path text;

CREATE INDEX IF NOT EXISTS search_documents_artist_name_trgm_idx
  ON search_private.search_documents USING gin (artist_name public.gin_trgm_ops)
  WHERE source_type = 'music';

CREATE TABLE IF NOT EXISTS search_private.search_features (
  slug text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  target_path text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE search_private.search_features FROM PUBLIC, anon, authenticated;
ALTER TABLE search_private.search_features ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION search_private.sync_search_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, search_private
AS $$
DECLARE
  v_row search_private.search_features;
  v_slug text;
  v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_slug := OLD.slug;
    DELETE FROM search_private.search_documents
    WHERE source_type = 'feature' AND source_id = md5('afuchat-feature:' || v_slug)::uuid;
    RETURN OLD;
  END IF;

  v_row := NEW;
  v_slug := v_row.slug;
  v_id := md5('afuchat-feature:' || v_slug)::uuid;

  DELETE FROM search_private.search_documents
  WHERE source_type = 'feature' AND source_id = v_id;

  IF v_row.is_enabled THEN
    INSERT INTO search_private.search_documents (
      source_type, source_id, title, body, created_at, popularity, is_verified, target_path
    ) VALUES (
      'feature',
      v_id,
      v_row.title,
      concat_ws(' ', v_row.description, array_to_string(v_row.keywords, ' ')),
      v_row.updated_at,
      0,
      false,
      v_row.target_path
    )
    ON CONFLICT (source_type, source_id) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      created_at = EXCLUDED.created_at,
      target_path = EXCLUDED.target_path;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION search_private.sync_search_feature() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS search_feature_document_sync ON search_private.search_features;
CREATE TRIGGER search_feature_document_sync
AFTER INSERT OR UPDATE OR DELETE ON search_private.search_features
FOR EACH ROW EXECUTE FUNCTION search_private.sync_search_feature();

INSERT INTO search_private.search_features (slug, title, description, keywords, target_path) VALUES
  ('afumusic', 'AfuMusic', 'Discover and listen to music, tracks, and artists', ARRAY['music','songs','tracks','artists','albums','audio','listen'], '/app/afumusic'),
  ('afupay', 'AfuPay Wallet', 'Manage your wallet, ACoins, payments, and transfers', ARRAY['wallet','payments','money','acoin','transfer','top up','bills','airtime'], '/app/afupay'),
  ('afugifts', 'Gifts', 'Browse virtual gifts and send gifts to creators', ARRAY['gift','gifting','virtual gifts','creator gifts'], '/app/afugifts'),
  ('afumarket', 'AfuMarket', 'Discover products and shop on AfuChat', ARRAY['market','shop','shopping','products','store','buy','sell'], '/app/afumarket'),
  ('afufreelance', 'AfuFreelance', 'Find freelance services and gigs', ARRAY['freelance','gigs','services','work'], '/app/afufreelance'),
  ('afuevents', 'Events', 'Discover events and tickets', ARRAY['events','tickets','concerts','meetups'], '/app/afuevents'),
  ('companies', 'Companies', 'Discover company and organisation pages', ARRAY['company','companies','business','organisation','organization','brands'], '/company'),
  ('communities', 'Communities', 'Find public groups and communities', ARRAY['communities','groups','community','join'], '/communities'),
  ('discover', 'Discover', 'Explore trending posts, hashtags, and people', ARRAY['discover','trending','explore','hashtags'], '/discover'),
  ('moments', 'Moments', 'Explore posts, articles, photos, and videos', ARRAY['moments','posts','articles','photos','videos','feed'], '/moments'),
  ('saved', 'Saved Posts', 'Open your bookmarked and saved content', ARRAY['saved','bookmarks','bookmarked','collections'], '/app/afusaved'),
  ('afumatch', 'AfuMatch', 'Discover compatible people', ARRAY['match','matching','dating','compatibility'], '/app/afumatch'),
  ('contacts', 'Contacts', 'Open your contacts and friends', ARRAY['contacts','friends','following'], '/contacts'),
  ('usernames', 'AfuUsernames', 'Browse and manage usernames', ARRAY['usernames','handles','username marketplace'], '/app/afuusernames'),
  ('afusearch', 'AfuSearch', 'Search people, songs, artists, companies, posts, gifts, and features', ARRAY['search','find','lookup','search engine','people search','music search'], '/app/afusearch'),
  ('chats', 'Chats and Messaging', 'Open conversations and send messages', ARRAY['chat','chats','messaging','messages','inbox','direct messages'], '/(tabs)/chats'),
  ('profile', 'My Profile', 'View your AfuChat profile', ARRAY['profile','my account','bio','avatar','account'], '/me'),
  ('digital-id', 'Digital ID', 'Open your shareable AfuChat digital identity card', ARRAY['digital id','identity card','qr','profile card'], '/digital-id'),
  ('short-videos', 'Short Videos', 'Explore short-form videos', ARRAY['short videos','shorts','reels','clips','video feed'], '/shorts'),
  ('wallet-topup', 'Add ACoins', 'Top up your AfuPay wallet', ARRAY['top up','topup','buy acoins','add money','wallet balance'], '/app/afupay?section=topup'),
  ('wallet-send', 'Send Money', 'Send ACoins or Nexa to another user', ARRAY['send money','transfer','send acorns','send acoins','nexa'], '/app/afupay?section=send'),
  ('wallet-receive', 'Receive Money', 'Receive payments and show your wallet QR', ARRAY['receive money','receive payment','wallet qr'], '/app/afupay?section=receive'),
  ('wallet-requests', 'Payment Requests', 'Manage money requests', ARRAY['payment requests','request money','pay requests'], '/app/afupay?section=requests'),
  ('wallet-bills', 'Pay Bills', 'Pay supported utility and TV bills', ARRAY['bills','electricity','water bill','tv bill','utilities'], '/app/afupay?section=bills'),
  ('wallet-airtime', 'Buy Airtime', 'Purchase mobile airtime', ARRAY['airtime','mobile top up','phone credit'], '/app/afupay?section=airtime'),
  ('wallet-data', 'Buy Data Bundles', 'Purchase mobile internet data', ARRAY['data bundles','internet bundles','mobile data'], '/app/afupay?section=data-bundles'),
  ('market-cart', 'Shopping Cart', 'View products in your cart', ARRAY['cart','shopping cart','checkout'], '/app/afumarket?section=cart'),
  ('market-orders', 'My Orders', 'Track marketplace orders', ARRAY['orders','purchases','order tracking'], '/app/afumarket?section=orders'),
  ('market-manage', 'Manage My Shop', 'Set up and manage your shop', ARRAY['manage shop','seller dashboard','my store'], '/app/afumarket?section=manage'),
  ('gift-marketplace', 'Gift Marketplace', 'Browse virtual gifts available to send', ARRAY['gift marketplace','buy gifts','virtual gift shop'], '/app/afugifts?section=marketplace'),
  ('freelance-jobs', 'Freelance Services', 'Browse freelance work and services', ARRAY['jobs','freelance jobs','gigs','hire freelancers','find work'], '/app/afufreelance'),
  ('event-tickets', 'Event Tickets', 'Discover events and ticket options', ARRAY['event tickets','concert tickets','buy tickets'], '/app/afuevents'),
  ('prestige', 'Prestige Rankings', 'Explore XP and prestige rankings', ARRAY['leaderboard','rankings','prestige','xp leaderboard'], '/prestige'),
  ('apps', 'Apps', 'Browse AfuChat apps and tools', ARRAY['apps','tools','platform features','mini apps'], '/apps')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  keywords = EXCLUDED.keywords,
  target_path = EXCLUDED.target_path,
  is_enabled = true,
  updated_at = statement_timestamp();

-- Populate the new index fields for existing published tracks.
UPDATE search_private.search_documents AS d
SET artist_name = mt.artist
FROM public.music_tracks AS mt
WHERE d.source_type = 'music'
  AND d.source_id = mt.id
  AND d.artist_name IS DISTINCT FROM mt.artist;

CREATE OR REPLACE FUNCTION search_private.sync_music_artist_search_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, search_private, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE search_private.search_documents
    SET artist_name = NULL
    WHERE source_type = 'music' AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  UPDATE search_private.search_documents
  SET artist_name = NEW.artist
  WHERE source_type = 'music' AND source_id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION search_private.sync_music_artist_search_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS z_search_music_artist_fields_sync ON public.music_tracks;
CREATE TRIGGER z_search_music_artist_fields_sync
AFTER INSERT OR UPDATE OF title, artist, genre, status OR DELETE ON public.music_tracks
FOR EACH ROW EXECUTE FUNCTION search_private.sync_music_artist_search_fields();

CREATE OR REPLACE FUNCTION public.get_platform_search_suggestions(
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  suggestion_type text,
  source_type text,
  source_id uuid,
  title text,
  subtitle text,
  target_path text,
  score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, search_private, public
SET pg_trgm.similarity_threshold = '0.18'
AS $$
  WITH input AS (
    SELECT lower(btrim(regexp_replace(
      regexp_replace(normalize(coalesce(p_query, ''), NFKC), '[[:cntrl:]]', ' ', 'g'),
      '[[:space:]]+', ' ', 'g'
    ))) AS q
  ),
  candidates AS (
    SELECT
      d.source_type,
      d.source_id,
      d.title,
      CASE
        WHEN d.source_type = 'music' AND nullif(d.artist_name, '') IS NOT NULL
          THEN 'Song · ' || d.artist_name
        WHEN d.source_type = 'profile' THEN 'Person'
        WHEN d.source_type = 'organization_page' THEN 'Company'
        WHEN d.source_type = 'post' THEN 'Post'
        WHEN d.source_type = 'video' THEN 'Video'
        WHEN d.source_type = 'gift' THEN 'Gift'
        WHEN d.source_type = 'feature' THEN 'AfuChat feature'
        WHEN d.source_type = 'channel' THEN 'Channel'
        WHEN d.source_type = 'group' THEN 'Group'
        WHEN d.source_type = 'event' THEN 'Event'
        WHEN d.source_type = 'job' THEN 'Job'
        WHEN d.source_type = 'product' THEN 'Product'
        WHEN d.source_type = 'freelance' THEN 'Freelance service'
        WHEN d.source_type = 'paid_community' THEN 'Community'
        ELSE initcap(replace(d.source_type, '_', ' '))
      END AS subtitle,
      d.target_path,
      (
        CASE WHEN lower(d.title) = i.q THEN 100.0 ELSE 0.0 END
        + CASE WHEN lower(d.title) LIKE i.q || '%' THEN 35.0 ELSE 0.0 END
        + CASE WHEN d.source_type = 'music' AND lower(coalesce(d.artist_name, '')) = i.q THEN 80.0 ELSE 0.0 END
        + CASE WHEN d.source_type = 'music' AND lower(coalesce(d.artist_name, '')) LIKE i.q || '%' THEN 45.0 ELSE 0.0 END
        + CASE WHEN d.search_vector @@ websearch_to_tsquery('simple'::regconfig, i.q)
          THEN ts_rank_cd(d.search_vector, websearch_to_tsquery('simple'::regconfig, i.q)) * 12.0 ELSE 0.0 END
        + greatest(public.similarity(d.title, i.q), public.similarity(coalesce(d.artist_name, ''), i.q)) * 8.0
        + ln(1.0 + greatest(d.popularity, 0.0)) * 1.5
      )::double precision AS score,
      d.popularity,
      d.created_at
    FROM search_private.search_documents AS d
    CROSS JOIN input AS i
    WHERE auth.uid() IS NOT NULL
      AND i.q <> ''
      AND char_length(i.q) >= 2
      AND (
        d.search_vector @@ websearch_to_tsquery('simple'::regconfig, i.q)
        OR d.title ILIKE '%' || replace(replace(replace(i.q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
        OR coalesce(d.artist_name, '') ILIKE '%' || replace(replace(replace(i.q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
        OR d.body ILIKE '%' || replace(replace(replace(i.q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
      )
      AND d.source_type <> 'profile'
  ),
  ranked AS (
    SELECT c.*,
      row_number() OVER (
        PARTITION BY c.source_type
        ORDER BY c.score DESC, c.popularity DESC, c.created_at DESC
      ) AS type_rank
    FROM candidates AS c
  )
  SELECT
    'content'::text,
    r.source_type,
    r.source_id,
    r.title,
    r.subtitle,
    r.target_path,
    r.score
  FROM ranked AS r
  CROSS JOIN input AS i
  WHERE r.type_rank <= CASE WHEN r.source_type = 'music' THEN 4 ELSE 2 END
  ORDER BY r.score DESC, r.popularity DESC, r.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 8), 1), 12);
$$;

REVOKE ALL ON FUNCTION public.get_platform_search_suggestions(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_search_suggestions(text, integer) TO authenticated;
