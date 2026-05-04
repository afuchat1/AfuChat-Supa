-- Organization Pages (LinkedIn-style company pages)
-- Only users with is_organization_verified = true can create pages.

CREATE TABLE IF NOT EXISTS organization_pages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  tagline       TEXT,
  description   TEXT,
  logo_url      TEXT,
  cover_url     TEXT,
  website       TEXT,
  email         TEXT,
  phone         TEXT,
  industry      TEXT,
  org_type      TEXT,
  size          TEXT,        -- "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
  founded_year  INTEGER,
  location         TEXT,
  physical_address TEXT,
  social_links     JSONB       NOT NULL DEFAULT '{}',
  admin_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_verified   BOOLEAN     NOT NULL DEFAULT FALSE,
  followers_count INTEGER   NOT NULL DEFAULT 0,
  posts_count   INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_pages_admin_id_idx ON organization_pages(admin_id);
CREATE INDEX IF NOT EXISTS organization_pages_slug_idx      ON organization_pages(slug);

-- Page followers
CREATE TABLE IF NOT EXISTS organization_page_followers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID        NOT NULL REFERENCES organization_pages(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_page_followers_page_idx ON organization_page_followers(page_id);
CREATE INDEX IF NOT EXISTS org_page_followers_user_idx ON organization_page_followers(user_id);

-- Page posts / updates
CREATE TABLE IF NOT EXISTS organization_page_posts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID        NOT NULL REFERENCES organization_pages(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 3000),
  image_url  TEXT,
  likes      INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_page_posts_page_idx ON organization_page_posts(page_id, created_at DESC);

-- Page team members (admins + editors)
CREATE TABLE IF NOT EXISTS organization_page_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID        NOT NULL REFERENCES organization_pages(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('admin','editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id, user_id)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE organization_pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_page_followers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_page_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_page_members    ENABLE ROW LEVEL SECURITY;

-- organization_pages
DROP POLICY IF EXISTS "org_pages_select"  ON organization_pages;
DROP POLICY IF EXISTS "org_pages_insert"  ON organization_pages;
DROP POLICY IF EXISTS "org_pages_update"  ON organization_pages;
DROP POLICY IF EXISTS "org_pages_delete"  ON organization_pages;

CREATE POLICY "org_pages_select" ON organization_pages FOR SELECT USING (true);

CREATE POLICY "org_pages_insert" ON organization_pages FOR INSERT
  WITH CHECK (
    auth.uid() = admin_id
    AND (
      SELECT is_verified FROM public.profiles WHERE id = auth.uid()
    ) = true
  );

CREATE POLICY "org_pages_update" ON organization_pages FOR UPDATE
  USING (
    auth.uid() = admin_id
    OR EXISTS (
      SELECT 1 FROM organization_page_members
      WHERE page_id = organization_pages.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "org_pages_delete" ON organization_pages FOR DELETE
  USING (auth.uid() = admin_id);

-- organization_page_followers
DROP POLICY IF EXISTS "org_followers_select" ON organization_page_followers;
DROP POLICY IF EXISTS "org_followers_insert" ON organization_page_followers;
DROP POLICY IF EXISTS "org_followers_delete" ON organization_page_followers;

CREATE POLICY "org_followers_select" ON organization_page_followers FOR SELECT USING (true);

CREATE POLICY "org_followers_insert" ON organization_page_followers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "org_followers_delete" ON organization_page_followers FOR DELETE
  USING (auth.uid() = user_id);

-- organization_page_posts
DROP POLICY IF EXISTS "org_posts_select" ON organization_page_posts;
DROP POLICY IF EXISTS "org_posts_insert" ON organization_page_posts;
DROP POLICY IF EXISTS "org_posts_delete" ON organization_page_posts;

CREATE POLICY "org_posts_select" ON organization_page_posts FOR SELECT USING (true);

CREATE POLICY "org_posts_insert" ON organization_page_posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      EXISTS (SELECT 1 FROM organization_pages   WHERE id = page_id AND admin_id  = auth.uid())
      OR
      EXISTS (SELECT 1 FROM organization_page_members WHERE page_id = organization_page_posts.page_id AND user_id = auth.uid())
    )
  );

CREATE POLICY "org_posts_delete" ON organization_page_posts FOR DELETE
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM organization_pages WHERE id = page_id AND admin_id = auth.uid())
  );

-- organization_page_members
DROP POLICY IF EXISTS "org_members_select" ON organization_page_members;
DROP POLICY IF EXISTS "org_members_insert" ON organization_page_members;
DROP POLICY IF EXISTS "org_members_delete" ON organization_page_members;

CREATE POLICY "org_members_select" ON organization_page_members FOR SELECT USING (true);

CREATE POLICY "org_members_insert" ON organization_page_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM organization_pages WHERE id = page_id AND admin_id = auth.uid())
  );

CREATE POLICY "org_members_delete" ON organization_page_members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM organization_pages WHERE id = page_id AND admin_id = auth.uid())
  );

-- ── followers_count trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_org_page_followers_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organization_pages SET followers_count = followers_count + 1 WHERE id = NEW.page_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organization_pages SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.page_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_page_followers_count ON organization_page_followers;
CREATE TRIGGER trg_org_page_followers_count
  AFTER INSERT OR DELETE ON organization_page_followers
  FOR EACH ROW EXECUTE FUNCTION update_org_page_followers_count();

-- ── posts_count trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_org_page_posts_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organization_pages SET posts_count = posts_count + 1 WHERE id = NEW.page_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organization_pages SET posts_count = GREATEST(0, posts_count - 1) WHERE id = OLD.page_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_page_posts_count ON organization_page_posts;
CREATE TRIGGER trg_org_page_posts_count
  AFTER INSERT OR DELETE ON organization_page_posts
  FOR EACH ROW EXECUTE FUNCTION update_org_page_posts_count();

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_org_page_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_org_page_updated_at ON organization_pages;
CREATE TRIGGER trg_org_page_updated_at
  BEFORE UPDATE ON organization_pages
  FOR EACH ROW EXECUTE FUNCTION set_org_page_updated_at();

-- ── Page-to-page connections (a company page follows another company page) ───

CREATE TABLE IF NOT EXISTS organization_page_connections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_page_id  UUID        NOT NULL REFERENCES organization_pages(id) ON DELETE CASCADE,
  following_page_id UUID        NOT NULL REFERENCES organization_pages(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_page_id, following_page_id),
  CHECK (follower_page_id <> following_page_id)
);

CREATE INDEX IF NOT EXISTS org_page_conn_follower_idx  ON organization_page_connections(follower_page_id);
CREATE INDEX IF NOT EXISTS org_page_conn_following_idx ON organization_page_connections(following_page_id);

ALTER TABLE organization_page_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_connections_select" ON organization_page_connections;
DROP POLICY IF EXISTS "org_connections_insert" ON organization_page_connections;
DROP POLICY IF EXISTS "org_connections_delete" ON organization_page_connections;

CREATE POLICY "org_connections_select" ON organization_page_connections FOR SELECT USING (true);

CREATE POLICY "org_connections_insert" ON organization_page_connections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_pages
      WHERE id = follower_page_id AND admin_id = auth.uid()
    )
  );

CREATE POLICY "org_connections_delete" ON organization_page_connections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_pages
      WHERE id = follower_page_id AND admin_id = auth.uid()
    )
  );
