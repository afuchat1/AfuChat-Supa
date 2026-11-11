-- Expose only the non-sensitive app update settings to mobile clients.
-- app_settings also stores server-side configuration and must remain private.
CREATE OR REPLACE FUNCTION public.get_public_app_update_info()
RETURNS TABLE (
  setting_key text,
  setting_value text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.key, s.value
  FROM public.app_settings AS s
  WHERE lower(s.key) IN (
    'latest_app_version',
    'min_app_version',
    'android_store_url'
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_app_update_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_app_update_info() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
