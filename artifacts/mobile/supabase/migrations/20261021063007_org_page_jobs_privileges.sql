-- Tighten privileges and let organization owners manage inactive jobs too.
REVOKE ALL PRIVILEGES ON TABLE public.org_page_jobs FROM anon, authenticated;
GRANT SELECT ON TABLE public.org_page_jobs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.org_page_jobs TO authenticated;

DROP POLICY IF EXISTS org_page_jobs_admin_read ON public.org_page_jobs;
CREATE POLICY org_page_jobs_admin_read
  ON public.org_page_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_pages p
      WHERE p.id = page_id
        AND p.admin_id = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';