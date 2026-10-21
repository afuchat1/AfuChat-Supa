-- Restore the organization jobs data path used by company pages and search.
CREATE TABLE IF NOT EXISTS public.org_page_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.organization_pages(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  job_type text NOT NULL DEFAULT 'Full-time',
  location text,
  description text NOT NULL CHECK (length(trim(description)) >= 20),
  apply_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_page_jobs_active_created_idx
  ON public.org_page_jobs (page_id, created_at DESC)
  WHERE is_active = true;

ALTER TABLE public.org_page_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_page_jobs_public_read ON public.org_page_jobs;
CREATE POLICY org_page_jobs_public_read
  ON public.org_page_jobs FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS org_page_jobs_admin_insert ON public.org_page_jobs;
CREATE POLICY org_page_jobs_admin_insert
  ON public.org_page_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_pages p
      WHERE p.id = page_id AND p.admin_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS org_page_jobs_admin_update ON public.org_page_jobs;
CREATE POLICY org_page_jobs_admin_update
  ON public.org_page_jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_pages p
      WHERE p.id = page_id AND p.admin_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_pages p
      WHERE p.id = page_id AND p.admin_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS org_page_jobs_admin_delete ON public.org_page_jobs;
CREATE POLICY org_page_jobs_admin_delete
  ON public.org_page_jobs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_pages p
      WHERE p.id = page_id AND p.admin_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON public.org_page_jobs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.org_page_jobs TO authenticated;

DROP TRIGGER IF EXISTS org_page_jobs_updated_at ON public.org_page_jobs;
CREATE TRIGGER org_page_jobs_updated_at
BEFORE UPDATE ON public.org_page_jobs
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS search_document_sync ON public.org_page_jobs;
CREATE TRIGGER search_document_sync
AFTER INSERT OR UPDATE OF title, job_type, location, description, is_active, created_at OR DELETE
ON public.org_page_jobs FOR EACH ROW
EXECUTE FUNCTION search_private.sync_public_search_document();

NOTIFY pgrst, 'reload schema';