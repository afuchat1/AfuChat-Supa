-- Remove inherited/default anon execution from the presence write RPC.
REVOKE ALL ON FUNCTION public.update_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_last_seen() TO authenticated;

NOTIFY pgrst, 'reload schema';