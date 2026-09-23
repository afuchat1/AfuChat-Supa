-- AfuCloud schema boundary guard.
-- Only auth.users and accounts.profiles are shared; every other AfuCloud
-- table must live in afucloud.
CREATE SCHEMA IF NOT EXISTS afucloud;
CREATE SCHEMA IF NOT EXISTS accounts;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'refresh_tokens',
    'projects',
    'images',
    'api_keys',
    'personal_tokens',
    'webhooks',
    'activity_logs',
    'domains',
    'hostnames',
    'storage_containers',
    'storage_objects'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      RAISE EXCEPTION
        'AfuCloud table public.% is outside the afucloud schema; migrate it before starting AfuCloud',
        table_name;
    END IF;
  END LOOP;
END $$;