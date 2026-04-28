-- ─── Server runtime settings ──────────────────────────────────────────────
-- A simple key/value store for *server-side* runtime configuration that
-- the API server fetches on boot. RLS is enabled with no policies so only
-- service_role (which bypasses RLS) can read or write.
--
-- This is the single source of truth for things like Cloudflare R2
-- credentials so we don't have to store them in the deploy environment.
-- Bootstrap secret (SUPABASE_SERVICE_ROLE_KEY) is the only env var the
-- API server needs.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Lock down direct API access. service_role bypasses RLS and is the
-- only role that should ever touch this table.
REVOKE ALL ON TABLE public.app_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.app_settings FROM anon;
REVOKE ALL ON TABLE public.app_settings FROM authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO service_role;

CREATE OR REPLACE FUNCTION public.app_settings_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_settings_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.app_settings_set_updated_at();
