-- Watch Together — live match rooms with chat, reactions, and presence.
-- Additive & idempotent. Does NOT alter existing tables.

-- ── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.watch_matches (
  id            uuid primary key default gen_random_uuid(),
  sport         text not null default 'football',
  league        text,
  home_team     text not null,
  away_team     text not null,
  home_logo     text,
  away_logo     text,
  home_score    int  not null default 0,
  away_score    int  not null default 0,
  status        text not null default 'scheduled', -- scheduled | live | ht | ft | postponed
  minute        int,
  kickoff_at    timestamptz not null,
  venue         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists watch_matches_status_idx   on public.watch_matches(status);
create index if not exists watch_matches_kickoff_idx  on public.watch_matches(kickoff_at);

create table if not exists public.watch_match_events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.watch_matches(id) on delete cascade,
  minute      int,
  type        text not null,           -- goal | yellow | red | sub | var | ht | ft | kickoff | info
  team        text,                    -- 'home' | 'away' | null
  player      text,
  description text,
  created_at  timestamptz not null default now()
);

create index if not exists watch_match_events_match_idx on public.watch_match_events(match_id, created_at);

create table if not exists public.watch_rooms (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null unique references public.watch_matches(id) on delete cascade,
  title       text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.watch_messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.watch_rooms(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  display_name text,
  avatar_url   text,
  body        text not null,
  kind        text not null default 'user', -- user | system
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists watch_messages_room_idx on public.watch_messages(room_id, created_at desc);

create table if not exists public.watch_reactions (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.watch_rooms(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  emoji      text not null,
  created_at timestamptz not null default now()
);

create index if not exists watch_reactions_room_idx on public.watch_reactions(room_id, created_at desc);

-- ── Auto-create a chat room when a match is inserted ───────────────────────

create or replace function public.fn_watch_create_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.watch_rooms (match_id, title)
  values (new.id, new.home_team || ' vs ' || new.away_team)
  on conflict (match_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_watch_matches_create_room on public.watch_matches;
create trigger trg_watch_matches_create_room
  after insert on public.watch_matches
  for each row execute function public.fn_watch_create_room();

-- ── Auto-post system messages from match events ────────────────────────────

create or replace function public.fn_watch_event_to_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
  v_body text;
  v_minute_text text;
begin
  select id into v_room from public.watch_rooms where match_id = new.match_id;
  if v_room is null then return new; end if;

  v_minute_text := case when new.minute is not null then new.minute::text || '′ ' else '' end;

  v_body := case new.type
    when 'goal'    then v_minute_text || '⚽ GOAL! ' || coalesce(new.player || ' — ', '') || coalesce(new.description, '')
    when 'yellow'  then v_minute_text || '🟨 Yellow card — ' || coalesce(new.player, coalesce(new.description, ''))
    when 'red'     then v_minute_text || '🟥 Red card — ' || coalesce(new.player, coalesce(new.description, ''))
    when 'sub'     then v_minute_text || '🔄 Substitution — ' || coalesce(new.description, '')
    when 'var'     then v_minute_text || '📺 VAR check — ' || coalesce(new.description, '')
    when 'ht'      then '⏸ Half-time'
    when 'ft'      then '⏹ Full-time'
    when 'kickoff' then '▶ Kick-off!'
    else v_minute_text || coalesce(new.description, new.type)
  end;

  insert into public.watch_messages (room_id, user_id, display_name, body, kind, meta)
  values (v_room, null, 'Match Bot', v_body, 'system', jsonb_build_object('event_id', new.id, 'event_type', new.type, 'team', new.team, 'minute', new.minute));

  return new;
end;
$$;

drop trigger if exists trg_watch_events_to_message on public.watch_match_events;
create trigger trg_watch_events_to_message
  after insert on public.watch_match_events
  for each row execute function public.fn_watch_event_to_message();

-- Touch updated_at on watch_matches changes
create or replace function public.fn_watch_matches_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_watch_matches_touch on public.watch_matches;
create trigger trg_watch_matches_touch
  before update on public.watch_matches
  for each row execute function public.fn_watch_matches_touch();

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.watch_matches       enable row level security;
alter table public.watch_match_events  enable row level security;
alter table public.watch_rooms         enable row level security;
alter table public.watch_messages      enable row level security;
alter table public.watch_reactions     enable row level security;

drop policy if exists "watch_matches_read_all"      on public.watch_matches;
create policy "watch_matches_read_all"      on public.watch_matches      for select using (true);

drop policy if exists "watch_match_events_read_all" on public.watch_match_events;
create policy "watch_match_events_read_all" on public.watch_match_events for select using (true);

drop policy if exists "watch_rooms_read_all"        on public.watch_rooms;
create policy "watch_rooms_read_all"        on public.watch_rooms        for select using (true);

drop policy if exists "watch_messages_read_all"     on public.watch_messages;
create policy "watch_messages_read_all"     on public.watch_messages     for select using (true);

drop policy if exists "watch_messages_insert_self"  on public.watch_messages;
create policy "watch_messages_insert_self"  on public.watch_messages
  for insert with check (
    auth.uid() is not null
    and kind = 'user'
    and user_id = auth.uid()
  );

drop policy if exists "watch_messages_delete_own"   on public.watch_messages;
create policy "watch_messages_delete_own"   on public.watch_messages
  for delete using (auth.uid() = user_id);

drop policy if exists "watch_reactions_read_all"    on public.watch_reactions;
create policy "watch_reactions_read_all"    on public.watch_reactions    for select using (true);

drop policy if exists "watch_reactions_insert_self" on public.watch_reactions;
create policy "watch_reactions_insert_self" on public.watch_reactions
  for insert with check (auth.uid() is not null and user_id = auth.uid());

-- ── Realtime publication ──────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.watch_matches';      exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.watch_match_events'; exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.watch_messages';     exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.watch_reactions';    exception when duplicate_object then null; end;
  end if;
end $$;

-- ── Demo seed (only if table is empty) ─────────────────────────────────────

do $$
declare
  v_count int;
  v_now timestamptz := now();
begin
  select count(*) into v_count from public.watch_matches;
  if v_count = 0 then
    insert into public.watch_matches
      (sport, league, home_team, away_team, home_score, away_score, status, minute, kickoff_at, venue)
    values
      ('football', 'Premier League',  'Arsenal',          'Chelsea',          1, 0, 'live',      37, v_now - interval '37 minutes',  'Emirates Stadium'),
      ('football', 'La Liga',         'Real Madrid',      'Barcelona',        2, 2, 'live',      68, v_now - interval '68 minutes',  'Santiago Bernabéu'),
      ('football', 'Serie A',         'Inter Milan',      'AC Milan',         0, 0, 'scheduled', null, v_now + interval '2 hours',     'San Siro'),
      ('football', 'CAF Champions',   'Al Ahly',          'Mamelodi Sundowns',0, 0, 'scheduled', null, v_now + interval '5 hours',     'Cairo Stadium'),
      ('football', 'Premier League',  'Manchester City',  'Liverpool',        3, 1, 'ft',        90, v_now - interval '3 hours',     'Etihad Stadium');
  end if;
end $$;
