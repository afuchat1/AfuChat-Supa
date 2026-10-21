-- Avoid redundant profile writes from app-foreground events and periodic
-- heartbeats. The 45-second guard suppresses duplicate calls while preserving
-- the existing 60-second presence cadence. Pin search_path for this definer RPC.
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.profiles
  SET last_seen = now()
  WHERE id = (SELECT auth.uid())
    AND (last_seen IS NULL OR last_seen < now() - interval '45 seconds');
END;
$function$;

REVOKE ALL ON FUNCTION public.update_last_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_last_seen() TO authenticated;

NOTIFY pgrst, 'reload schema';