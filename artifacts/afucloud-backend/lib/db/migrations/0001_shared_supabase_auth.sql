-- Shared Afu identity migration for Supabase PostgreSQL.
--
-- Identity and credentials live only in auth.users.
-- Shared profile data lives in accounts.profiles.
-- Product data lives in its product schema (afucloud.* here).
--
-- This migration is safe for:
--   1. a fresh database with no legacy AfuCloud users table
--   2. the previous AfuCloud database with public users/product tables
--
-- It intentionally does not create a product-specific credential table.

-- Product namespaces share auth.users and accounts.profiles, but never share
-- product-owned tables with one another.
CREATE SCHEMA IF NOT EXISTS accounts;
CREATE SCHEMA IF NOT EXISTS afucloud;

CREATE TABLE IF NOT EXISTS accounts.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  full_name text,
  avatar_url text,
  role_type text DEFAULT 'advertiser',
  advertiser_id text,
  publisher_id text,
  storage_used bigint NOT NULL DEFAULT 0,
  storage_limit bigint NOT NULL DEFAULT 1073741824,
  suspended boolean NOT NULL DEFAULT false,
  name text,
  avatar text,
  coins integer DEFAULT 0,
  referral_code text,
  referral_count integer DEFAULT 0,
  store_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add shared profile fields when this migration is applied to an older
-- accounts.profiles table. These are deliberately profile fields, not credentials.
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS role_type text DEFAULT 'advertiser';
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS advertiser_id text;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS publisher_id text;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS storage_used bigint NOT NULL DEFAULT 0;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS storage_limit bigint NOT NULL DEFAULT 1073741824;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS coins integer DEFAULT 0;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS referral_count integer DEFAULT 0;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS store_count integer DEFAULT 0;
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounts.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key
  ON accounts.profiles(user_id);

-- Keep Supabase's signup trigger compatible with the shared profile shape.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO accounts.profiles (
    user_id,
    email,
    email_verified,
    name,
    full_name
  )
  VALUES (
    new.id,
    new.email,
    new.email_confirmed_at IS NOT NULL,
    COALESCE(new.raw_user_meta_data->>'name', split_part(COALESCE(new.email, 'user'), '@', 1)),
    COALESCE(new.raw_user_meta_data->>'name', split_part(COALESCE(new.email, 'user'), '@', 1))
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = COALESCE(accounts.profiles.email, EXCLUDED.email),
    email_verified = EXCLUDED.email_verified,
    name = COALESCE(accounts.profiles.name, EXCLUDED.name),
    full_name = COALESCE(accounts.profiles.full_name, EXCLUDED.full_name),
    updated_at = now();
  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Move legacy AfuCloud tables out of public when an afucloud copy does not
-- already exist. The old users table is handled below as users_legacy.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'projects',
    'images',
    'api_keys',
    'personal_tokens',
    'refresh_tokens',
    'password_reset_tokens',
    'webhooks',
    'activity_logs'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL
       AND to_regclass('afucloud.' || table_name) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA afucloud', table_name);
    END IF;
  END LOOP;
END $$;

-- Promote legacy AfuCloud-only identities into auth.users and remap all
-- ownership rows to the shared Auth UUID. This block is a no-op on a fresh
-- shared-auth database where afucloud.users does not exist.
DO $$
DECLARE
  table_name text;
BEGIN
  IF to_regclass('afucloud.users') IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE afucloud_user_map (
    old_id uuid PRIMARY KEY,
    auth_id uuid NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO afucloud_user_map (old_id, auth_id)
  SELECT u.id, COALESCE(a.id, gen_random_uuid())
  FROM afucloud.users u
  LEFT JOIN auth.users a ON lower(a.email) = lower(u.email);

  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  SELECT
    m.auth_id,
    'authenticated',
    'authenticated',
    u.email,
    u.password_hash,
    CASE WHEN u.email_verified THEN COALESCE(u.updated_at, now()) END,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', u.name),
    u.created_at,
    u.updated_at
  FROM afucloud_user_map m
  JOIN afucloud.users u ON u.id = m.old_id
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = m.auth_id);

    INSERT INTO accounts.profiles (
    user_id,
    email,
    email_verified,
    name,
    full_name,
    avatar,
    created_at,
    updated_at
  )
  SELECT
    m.auth_id,
    u.email,
    u.email_verified,
    u.name,
    u.name,
    u.avatar,
    u.created_at,
    u.updated_at
  FROM afucloud_user_map m
  JOIN afucloud.users u ON u.id = m.old_id
  ON CONFLICT (user_id) DO UPDATE SET
    email = COALESCE(accounts.profiles.email, EXCLUDED.email),
    email_verified = accounts.profiles.email_verified OR EXCLUDED.email_verified,
    name = COALESCE(accounts.profiles.name, EXCLUDED.name),
    full_name = COALESCE(accounts.profiles.full_name, EXCLUDED.full_name),
    avatar = COALESCE(accounts.profiles.avatar, EXCLUDED.avatar),
    updated_at = GREATEST(accounts.profiles.updated_at, EXCLUDED.updated_at);

  FOREACH table_name IN ARRAY ARRAY[
    'projects',
    'personal_tokens',
    'refresh_tokens',
    'activity_logs',
    'password_reset_tokens'
  ] LOOP
    IF to_regclass('afucloud.' || table_name) IS NOT NULL THEN
      EXECUTE format(
        'UPDATE afucloud.%I target SET user_id = map.auth_id FROM afucloud_user_map map WHERE target.user_id = map.old_id',
        table_name
      );
    END IF;
  END LOOP;

  IF to_regclass('afucloud.users_legacy') IS NULL THEN
    ALTER TABLE afucloud.users RENAME TO users_legacy;
  END IF;

  IF to_regclass('afucloud.users_legacy') IS NOT NULL THEN
    ALTER TABLE afucloud.users_legacy DROP COLUMN IF EXISTS password_hash;
  END IF;
END $$;

-- Replace old ownership foreign keys with direct auth.users references.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'projects',
    'personal_tokens',
    'refresh_tokens',
    'activity_logs',
    'password_reset_tokens'
  ] LOOP
    IF to_regclass('afucloud.' || table_name) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE afucloud.%I DROP CONSTRAINT IF EXISTS %I',
        table_name,
        table_name || '_user_id_users_id_fk'
      );
      EXECUTE format(
        'ALTER TABLE afucloud.%I DROP CONSTRAINT IF EXISTS %I',
        table_name,
        table_name || '_user_id_auth_users_id_fk'
      );
      EXECUTE format(
        'ALTER TABLE afucloud.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
        table_name,
        table_name || '_user_id_auth_users_id_fk'
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_user_id_auth_users_id_fk'
      AND conrelid = 'accounts.profiles'::regclass
  ) THEN
    ALTER TABLE accounts.profiles
      ADD CONSTRAINT profiles_user_id_auth_users_id_fk
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;