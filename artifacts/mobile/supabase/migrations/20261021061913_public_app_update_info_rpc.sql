-- Expose only non-sensitive app update metadata to mobile clients.
-- app_settings also stores private server-side configuration.
CREATE OR REPLACE FUNCTION public.get_public_app_update_info()
RETURNS TABLE (setting_key text, setting_value text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.key::text, s.value::text
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
