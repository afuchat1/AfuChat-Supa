
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afumovies' AND tablename = 'movies' AND policyname = 'admins manage movie catalogue'
  ) THEN
    CREATE POLICY "admins manage movie catalogue"
      ON afumovies.movies FOR ALL TO authenticated
      USING (afumovies.is_admin())
      WITH CHECK (afumovies.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afumovies' AND tablename = 'vj_profiles' AND policyname = 'admins manage VJ profiles'
  ) THEN
    CREATE POLICY "admins manage VJ profiles"
      ON afumovies.vj_profiles FOR ALL TO authenticated
      USING (afumovies.is_admin())
      WITH CHECK (afumovies.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afumovies' AND tablename = 'video_versions' AND policyname = 'admins manage video versions'
  ) THEN
    CREATE POLICY "admins manage video versions"
      ON afumovies.video_versions FOR ALL TO authenticated
      USING (afumovies.is_admin())
      WITH CHECK (afumovies.is_admin());
  END IF;
END $$;
