-- Remove a legacy unconditional SELECT policy that overrides the intended
-- anon-only public-profile policy and exposes private profile rows.
DROP POLICY IF EXISTS profiles_select ON public.profiles;

NOTIFY pgrst, 'reload schema';