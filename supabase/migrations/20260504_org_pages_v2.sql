-- ── Extended business verification fields ──────────────────────────────────
-- Adds legal/registration/contact fields to the existing requests table.

ALTER TABLE business_verification_requests
  ADD COLUMN IF NOT EXISTS legal_name           TEXT,
  ADD COLUMN IF NOT EXISTS registration_number  TEXT,
  ADD COLUMN IF NOT EXISTS registration_country TEXT,
  ADD COLUMN IF NOT EXISTS phone                TEXT,
  ADD COLUMN IF NOT EXISTS business_address     TEXT,
  ADD COLUMN IF NOT EXISTS contact_name         TEXT,
  ADD COLUMN IF NOT EXISTS contact_title        TEXT;

-- ── Company-page exclusive: Job postings ───────────────────────────────────
-- Only organization pages can post jobs. Normal users have no access.

CREATE TABLE IF NOT EXISTS org_page_jobs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID        NOT NULL REFERENCES organization_pages(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  job_type    TEXT        NOT NULL DEFAULT 'Full-time'
              CHECK (job_type IN ('Full-time','Part-time','Contract','Internship','Volunteer','Remote')),
  location    TEXT,
  description TEXT        NOT NULL CHECK (char_length(description) BETWEEN 20 AND 5000),
  apply_url   TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_page_jobs_page_idx    ON org_page_jobs(page_id, is_active);
CREATE INDEX IF NOT EXISTS org_page_jobs_active_idx  ON org_page_jobs(is_active, created_at DESC);

ALTER TABLE org_page_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_jobs_select" ON org_page_jobs;
DROP POLICY IF EXISTS "org_jobs_insert" ON org_page_jobs;
DROP POLICY IF EXISTS "org_jobs_update" ON org_page_jobs;
DROP POLICY IF EXISTS "org_jobs_delete" ON org_page_jobs;

-- Anyone can browse active jobs
CREATE POLICY "org_jobs_select" ON org_page_jobs FOR SELECT USING (true);

-- Only the page admin can post jobs
CREATE POLICY "org_jobs_insert" ON org_page_jobs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_pages
      WHERE id = page_id AND admin_id = auth.uid()
    )
  );

CREATE POLICY "org_jobs_update" ON org_page_jobs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_pages
      WHERE id = page_id AND admin_id = auth.uid()
    )
  );

CREATE POLICY "org_jobs_delete" ON org_page_jobs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_pages
      WHERE id = page_id AND admin_id = auth.uid()
    )
  );

-- updated_at trigger for jobs
CREATE OR REPLACE FUNCTION set_org_job_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_org_job_updated_at ON org_page_jobs;
CREATE TRIGGER trg_org_job_updated_at
  BEFORE UPDATE ON org_page_jobs
  FOR EACH ROW EXECUTE FUNCTION set_org_job_updated_at();

-- ── Pinned announcements (company-page exclusive) ─────────────────────────
-- Each page can have at most one pinned announcement visible to all.

CREATE TABLE IF NOT EXISTS org_page_announcements (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID        NOT NULL REFERENCES organization_pages(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  is_pinned   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id)   -- one announcement per page
);

ALTER TABLE org_page_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_ann_select" ON org_page_announcements;
DROP POLICY IF EXISTS "org_ann_insert" ON org_page_announcements;
DROP POLICY IF EXISTS "org_ann_update" ON org_page_announcements;
DROP POLICY IF EXISTS "org_ann_delete" ON org_page_announcements;

CREATE POLICY "org_ann_select" ON org_page_announcements FOR SELECT USING (true);

CREATE POLICY "org_ann_insert" ON org_page_announcements FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM organization_pages WHERE id = page_id AND admin_id = auth.uid())
  );

CREATE POLICY "org_ann_update" ON org_page_announcements FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM organization_pages WHERE id = page_id AND admin_id = auth.uid())
  );

CREATE POLICY "org_ann_delete" ON org_page_announcements FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM organization_pages WHERE id = page_id AND admin_id = auth.uid())
  );
