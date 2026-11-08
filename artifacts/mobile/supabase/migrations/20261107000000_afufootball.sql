-- Shared provider cache plus per-user Football follows and notification preferences.
create table if not exists public.football_api_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists football_api_cache_expires_at_idx
  on public.football_api_cache (expires_at);

alter table public.football_api_cache enable row level security;

create table if not exists public.football_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('team', 'league')),
  entity_id text not null,
  entity_name text not null,
  entity_logo text,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create index if not exists football_follows_user_created_idx
  on public.football_follows (user_id, created_at desc);

alter table public.football_follows enable row level security;

create policy "Users read their football follows"
  on public.football_follows for select
  using (auth.uid() = user_id);

create policy "Users add their football follows"
  on public.football_follows for insert
  with check (auth.uid() = user_id);

create policy "Users remove their football follows"
  on public.football_follows for delete
  using (auth.uid() = user_id);

create table if not exists public.football_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kickoff boolean not null default true,
  goals boolean not null default true,
  half_time boolean not null default false,
  full_time boolean not null default true,
  followed_teams boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.football_notification_preferences enable row level security;

create policy "Users read their football notification preferences"
  on public.football_notification_preferences for select
  using (auth.uid() = user_id);

create policy "Users create their football notification preferences"
  on public.football_notification_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users update their football notification preferences"
  on public.football_notification_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
