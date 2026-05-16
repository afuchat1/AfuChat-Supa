-- Newsletter subscribers table
-- Stores emails collected from the public landing page.
-- No auth required to insert (handled by edge function with service role).

create table if not exists public.newsletter_subscribers (
  id            bigserial primary key,
  email         text not null,
  subscribed_at timestamptz not null default now(),
  active        boolean not null default true,
  source        text default 'landing_page',
  constraint newsletter_subscribers_email_key unique (email)
);

-- Index for quick lookups by email
create index if not exists newsletter_subscribers_email_idx
  on public.newsletter_subscribers (email);

-- Index for querying active subscribers
create index if not exists newsletter_subscribers_active_idx
  on public.newsletter_subscribers (active)
  where active = true;

-- RLS: table is only accessible via the service role key used by edge functions.
-- Anon/authenticated users cannot read or write directly.
alter table public.newsletter_subscribers enable row level security;

-- No public RLS policies — all access goes through the edge function (service role bypasses RLS).
