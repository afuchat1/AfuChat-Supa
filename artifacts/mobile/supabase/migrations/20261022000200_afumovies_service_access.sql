begin;

-- The Edge Function uses the service role for server-side workflows. It must
-- have explicit privileges in this custom schema; RLS bypass alone is not a grant.
grant all privileges on all tables in schema afumovies to service_role;

grant all privileges on all sequences in schema afumovies to service_role;

alter default privileges in schema afumovies grant all privileges on tables to service_role;

-- The invoker-rights catalog function is intentionally safe for public use:
-- it returns only versions that are published, available, and attached to an
-- active VJ. Its RLS policies call this helper.
grant execute on function afumovies.is_admin() to anon, authenticated, service_role;

grant execute on function afumovies.discover_movies(text, text, uuid, integer, integer) to anon, authenticated, service_role;

commit;
