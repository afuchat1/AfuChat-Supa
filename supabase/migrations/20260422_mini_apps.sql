-- AfuChat Mini Apps marketplace
-- Devs can publish lightweight web apps that get embedded inside AfuChat
-- via /apps/<slug>. Each app must provide privacy/terms/github links.

CREATE TABLE IF NOT EXISTS public.mini_apps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  tagline       text CHECK (tagline IS NULL OR char_length(tagline) <= 140),
  description   text CHECK (description IS NULL OR char_length(description) <= 4000),
  category      text NOT NULL DEFAULT 'utility'
                  CHECK (category IN ('utility','social','finance','games','education','productivity','entertainment','tools','other')),
  icon_url      text,
  app_url       text NOT NULL CHECK (app_url ~* '^https://'),
  privacy_url   text NOT NULL CHECK (privacy_url ~* '^https://'),
  terms_url     text NOT NULL CHECK (terms_url ~* '^https://'),
  github_url    text NOT NULL CHECK (github_url ~* '^https://(www\.)?github\.com/.+'),
  author_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','suspended')),
  reject_reason text,
  open_count    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mini_apps_status_category ON public.mini_apps(status, category);
CREATE INDEX IF NOT EXISTS idx_mini_apps_author ON public.mini_apps(author_id);
CREATE INDEX IF NOT EXISTS idx_mini_apps_popular ON public.mini_apps(open_count DESC) WHERE status = 'approved';

ALTER TABLE public.mini_apps ENABLE ROW LEVEL SECURITY;

-- Anyone can browse approved apps
DROP POLICY IF EXISTS "mini_apps_public_read" ON public.mini_apps;
CREATE POLICY "mini_apps_public_read" ON public.mini_apps
  FOR SELECT USING (status = 'approved' OR auth.uid() = author_id);

-- Authors can submit
DROP POLICY IF EXISTS "mini_apps_author_insert" ON public.mini_apps;
CREATE POLICY "mini_apps_author_insert" ON public.mini_apps
  FOR INSERT WITH CHECK (auth.uid() = author_id AND status = 'pending');

-- Authors can update their own draft/pending apps (cannot change status)
DROP POLICY IF EXISTS "mini_apps_author_update" ON public.mini_apps;
CREATE POLICY "mini_apps_author_update" ON public.mini_apps
  FOR UPDATE USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Authors can delete their own apps
DROP POLICY IF EXISTS "mini_apps_author_delete" ON public.mini_apps;
CREATE POLICY "mini_apps_author_delete" ON public.mini_apps
  FOR DELETE USING (auth.uid() = author_id);

-- Admin moderation (relies on profiles.is_admin)
DROP POLICY IF EXISTS "mini_apps_admin_all" ON public.mini_apps;
CREATE POLICY "mini_apps_admin_all" ON public.mini_apps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_mini_apps_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mini_apps_updated ON public.mini_apps;
CREATE TRIGGER trg_mini_apps_updated
  BEFORE UPDATE ON public.mini_apps
  FOR EACH ROW EXECUTE FUNCTION public.handle_mini_apps_updated();

-- Atomic open counter (anyone can call; counts as a launch)
CREATE OR REPLACE FUNCTION public.bump_mini_app_open(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mini_apps
     SET open_count = open_count + 1
   WHERE slug = p_slug AND status = 'approved';
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_mini_app_open(text) TO anon, authenticated;
