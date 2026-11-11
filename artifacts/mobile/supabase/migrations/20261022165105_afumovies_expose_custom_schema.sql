-- Keep AfuMovies REST resources in its own schema, alongside existing API schemas.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, storage, graphql_public, afumovies';
GRANT USAGE ON SCHEMA afumovies TO anon, authenticated;
GRANT SELECT ON afumovies.movies, afumovies.video_versions, afumovies.vj_profiles TO anon, authenticated;
NOTIFY pgrst, 'reload config';
