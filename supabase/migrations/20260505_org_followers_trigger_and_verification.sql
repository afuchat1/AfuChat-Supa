-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Auto-sync followers_count on organization_pages
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_org_page_followers_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.organization_pages
    SET followers_count = followers_count + 1
    WHERE id = NEW.page_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.organization_pages
    SET followers_count = GREATEST(0, followers_count - 1)
    WHERE id = OLD.page_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_page_followers_count ON public.organization_page_followers;
CREATE TRIGGER trg_org_page_followers_count
  AFTER INSERT OR DELETE ON public.organization_page_followers
  FOR EACH ROW EXECUTE FUNCTION public.update_org_page_followers_count();

-- Re-sync existing counts so we start with accurate numbers
UPDATE public.organization_pages op
SET followers_count = (
  SELECT COUNT(*)
  FROM public.organization_page_followers opf
  WHERE opf.page_id = op.id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Org verification requests table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_verification_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id      uuid        NOT NULL REFERENCES public.organization_pages(id) ON DELETE CASCADE,
  submitted_by uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes        text,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewer_id  uuid        REFERENCES auth.users(id)
);

ALTER TABLE public.org_verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_verreq_insert"
  ON public.org_verification_requests FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_pages
      WHERE id = page_id AND admin_id = auth.uid()
    )
  );

CREATE POLICY "org_verreq_select_own"
  ON public.org_verification_requests FOR SELECT
  USING (submitted_by = auth.uid());
