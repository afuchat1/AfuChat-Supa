-- Additive AfuCloud domains and R2-backed storage schema.
-- This migration targets the documented external Supabase database, where
-- auth.users is the shared identity source and product tables live in afucloud.

CREATE SCHEMA IF NOT EXISTS afucloud;

CREATE TABLE IF NOT EXISTS afucloud.domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  verification_token text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending',
  ssl_status text NOT NULL DEFAULT 'not_configured',
  dns_status text NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domains_user_hostname_unique UNIQUE (user_id, hostname)
);

CREATE TABLE IF NOT EXISTS afucloud.hostnames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL REFERENCES afucloud.domains(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  service text NOT NULL DEFAULT 'unconnected',
  service_id uuid,
  status text NOT NULL DEFAULT 'pending',
  ssl_status text NOT NULL DEFAULT 'pending',
  dns_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostnames_user_hostname_unique UNIQUE (user_id, hostname)
);

CREATE TABLE IF NOT EXISTS afucloud.storage_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES afucloud.projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  access_mode text NOT NULL DEFAULT 'private',
  cdn_enabled boolean NOT NULL DEFAULT false,
  cdn_hostname_id uuid REFERENCES afucloud.hostnames(id) ON DELETE SET NULL,
  cdn_status text NOT NULL DEFAULT 'disabled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_containers_user_slug_unique UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS afucloud.storage_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES afucloud.storage_containers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  name text NOT NULL,
  content_type text,
  size integer NOT NULL DEFAULT 0,
  etag text,
  is_folder boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_objects_container_key_unique UNIQUE (container_id, object_key)
);

CREATE INDEX IF NOT EXISTS domains_user_id_idx ON afucloud.domains(user_id);
CREATE INDEX IF NOT EXISTS hostnames_domain_id_idx ON afucloud.hostnames(domain_id);
CREATE INDEX IF NOT EXISTS storage_containers_user_id_idx ON afucloud.storage_containers(user_id);
CREATE INDEX IF NOT EXISTS storage_objects_container_id_idx ON afucloud.storage_objects(container_id);