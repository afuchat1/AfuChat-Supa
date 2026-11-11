
ALTER TABLE afumovies.video_versions
  ADD COLUMN IF NOT EXISTS object_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS object_etag text;

CREATE OR REPLACE FUNCTION afumovies.enforce_verified_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published' THEN
    IF NEW.is_available IS NOT TRUE
       OR NEW.object_verified_at IS NULL
       OR NULLIF(btrim(NEW.r2_object_key), '') IS NULL
       OR NEW.mime_type <> 'video/mp4'
       OR NOT EXISTS (
         SELECT 1 FROM afumovies.vj_profiles vj
         WHERE vj.id = NEW.vj_profile_id AND vj.is_active IS TRUE
       ) THEN
      RAISE EXCEPTION 'A video version cannot be published until its R2 object is verified, available, MP4, and assigned to an active VJ';
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
BEFORE INSERT OR UPDATE OF status, is_available, object_verified_at, r2_object_key, mime_type, vj_profile_id
ON afumovies.video_versions
FOR EACH ROW EXECUTE FUNCTION afumovies.enforce_verified_publication();

DROP POLICY IF EXISTS "viewers see published available versions" ON afumovies.video_versions;
CREATE POLICY "viewers see published verified available versions"
ON afumovies.video_versions FOR SELECT TO anon, authenticated
USING (
  afumovies.is_admin()
  OR (
    status = 'published'
    AND is_available IS TRUE
    AND object_verified_at IS NOT NULL
    AND mime_type = 'video/mp4'
  )
);

DROP POLICY IF EXISTS "viewers see movies with a published version" ON afumovies.movies;
CREATE POLICY "viewers see movies with a published verified version"
ON afumovies.movies FOR SELECT TO anon, authenticated
USING (
  afumovies.is_admin()
  OR EXISTS (
    SELECT 1
    FROM afumovies.video_versions vv
    JOIN afumovies.vj_profiles vj ON vj.id = vv.vj_profile_id
    WHERE vv.movie_id = movies.id
      AND vv.status = 'published'
      AND vv.is_available IS TRUE
      AND vv.object_verified_at IS NOT NULL
      AND vv.mime_type = 'video/mp4'
      AND vj.is_active IS TRUE
  )
);

CREATE INDEX IF NOT EXISTS video_versions_publication_lookup_idx
ON afumovies.video_versions (movie_id, status, is_available, object_verified_at)
WHERE status = 'published' AND is_available IS TRUE;
