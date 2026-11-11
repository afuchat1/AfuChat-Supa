-- VJs are translation credits/categories, not AfuChat user profiles.
-- Keep existing records and references while moving movie versions to category semantics.
CREATE TABLE IF NOT EXISTS afumovies.vj_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vj_categories_name_key UNIQUE (name),
  CONSTRAINT vj_categories_slug_key UNIQUE (slug)
);

-- Migrate existing VJ labels into category records if the legacy table exists.
DO $$
BEGIN
  IF to_regclass('afumovies.vj_profiles') IS NOT NULL THEN
    EXECUTE $m$
      INSERT INTO afumovies.vj_categories (name, slug, is_active)
      SELECT DISTINCT ON (lower(btrim(name)))
        btrim(name),
        COALESCE(NULLIF(lower(regexp_replace(btrim(slug), '[^a-zA-Z0-9_-]+', '-', 'g')), ''), 'vj-' || id::text),
        COALESCE(is_active, true)
      FROM afumovies.vj_profiles
      WHERE NULLIF(btrim(name), '') IS NOT NULL
      ORDER BY lower(btrim(name)), id
      ON CONFLICT (name) DO UPDATE SET is_active = EXCLUDED.is_active
    $m$;
  END IF;
END $$;

ALTER TABLE afumovies.video_versions
  ADD COLUMN IF NOT EXISTS vj_category_id uuid;

-- Backfill version references using the legacy VJ label.
DO $$
BEGIN
  IF to_regclass('afumovies.vj_profiles') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='afumovies' AND table_name='video_versions' AND column_name='vj_profile_id') THEN
    EXECUTE $m$
      UPDATE afumovies.video_versions vv
      SET vj_category_id = vc.id
      FROM afumovies.vj_profiles vp
      JOIN afumovies.vj_categories vc ON lower(vc.name) = lower(btrim(vp.name))
      WHERE vv.vj_profile_id = vp.id AND vv.vj_category_id IS NULL
    $m$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_versions_vj_category_id_fkey') THEN
    ALTER TABLE afumovies.video_versions
      ADD CONSTRAINT video_versions_vj_category_id_fkey
      FOREIGN KEY (vj_category_id) REFERENCES afumovies.vj_categories(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS video_versions_vj_category_idx
  ON afumovies.video_versions (vj_category_id);

-- Replace the publication invariant with category-based validation.
CREATE OR REPLACE FUNCTION afumovies.enforce_verified_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'published' THEN
    IF NEW.is_available IS NOT TRUE
       OR NEW.object_verified_at IS NULL
       OR NULLIF(btrim(NEW.r2_object_key), '') IS NULL
       OR NEW.mime_type <> 'video/mp4'
       OR NOT EXISTS (
          SELECT 1 FROM afumovies.vj_categories category
          WHERE category.id = NEW.vj_category_id AND category.is_active IS TRUE
       ) THEN
      RAISE EXCEPTION 'Cannot publish: the R2 object must be verified and available, MP4, and assigned to an active VJ translation category';
    END IF;
    NEW.published_at := COALESCE(NEW.published_at, now());
  ELSE
    NEW.published_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_verified_publication ON afumovies.video_versions;
CREATE TRIGGER enforce_verified_publication
BEFORE INSERT OR UPDATE OF status, is_available, object_verified_at, r2_object_key, mime_type, vj_category_id
ON afumovies.video_versions FOR EACH ROW
EXECUTE FUNCTION afumovies.enforce_verified_publication();

DROP POLICY IF EXISTS "viewers see movies with a published verified version" ON afumovies.movies;
CREATE POLICY "viewers see movies with a published verified version"
ON afumovies.movies FOR SELECT TO anon, authenticated
USING (afumovies.is_admin() OR EXISTS (
  SELECT 1 FROM afumovies.video_versions vv
  JOIN afumovies.vj_categories category ON category.id = vv.vj_category_id
  WHERE vv.movie_id = movies.id AND vv.status = 'published'
    AND vv.is_available IS TRUE AND vv.object_verified_at IS NOT NULL
    AND vv.mime_type = 'video/mp4' AND category.is_active IS TRUE
));

-- The old table/column are intentionally retained for backward compatibility
-- until all deployed clients have moved to vj_categories/vj_category_id.

ALTER TABLE afumovies.vj_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "viewers see active VJ categories" ON afumovies.vj_categories;
CREATE POLICY "viewers see active VJ categories"
ON afumovies.vj_categories FOR SELECT TO anon, authenticated
USING (is_active IS TRUE OR afumovies.is_admin());
GRANT SELECT ON afumovies.vj_categories TO anon, authenticated;


-- Production compatibility: new ingestion writes categories only, and the admin UI supports common HD qualities.
ALTER TABLE afumovies.video_versions ALTER COLUMN vj_profile_id DROP NOT NULL;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'afumovies.video_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%quality_p%'
  LOOP
    EXECUTE format('ALTER TABLE afumovies.video_versions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE afumovies.video_versions
  ADD CONSTRAINT video_versions_quality_p_supported
  CHECK (quality_p = ANY (ARRAY[360, 480, 720, 1080, 1440, 2160]::smallint[]));
