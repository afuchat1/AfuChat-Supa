-- AfuMusic: private tracks, atomic ACoin unlocks, and creator earnings.

create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  genre text not null default 'Other' check (char_length(trim(genre)) between 1 and 40),
  price_acoin integer not null default 0 check (price_acoin between 0 and 100000),
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null default 0 check (file_size >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 7200),
  play_count integer not null default 0 check (play_count >= 0),
  status text not null default 'published' check (status in ('published', 'removed')),
  created_at timestamptz not null default now()
);

-- The project previously had a small public music_tracks table. Keep its rows
-- readable while adding the private AfuMusic contract for new uploads.
alter table public.music_tracks add column if not exists creator_id uuid references public.profiles(id) on delete cascade;
alter table public.music_tracks add column if not exists price_acoin integer;
alter table public.music_tracks add column if not exists storage_path text;
alter table public.music_tracks add column if not exists mime_type text;
alter table public.music_tracks add column if not exists file_size bigint;
alter table public.music_tracks add column if not exists play_count integer;
alter table public.music_tracks add column if not exists status text;
alter table public.music_tracks add column if not exists artist text;
alter table public.music_tracks add column if not exists audio_url text;
alter table public.music_tracks add column if not exists usage_count integer;
alter table public.music_tracks add column if not exists is_featured boolean;

update public.music_tracks
set price_acoin = coalesce(price_acoin, 0),
    file_size = coalesce(file_size, 0),
    play_count = coalesce(play_count, usage_count, 0),
    mime_type = coalesce(mime_type, 'audio/mpeg'),
    status = coalesce(status, 'published')
where price_acoin is null
   or file_size is null
   or play_count is null
   or mime_type is null
   or status is null;

alter table public.music_tracks alter column price_acoin set default 0;
alter table public.music_tracks alter column file_size set default 0;
alter table public.music_tracks alter column play_count set default 0;
alter table public.music_tracks alter column mime_type set default 'audio/mpeg';
alter table public.music_tracks alter column status set default 'published';

create index if not exists music_tracks_discover_idx
  on public.music_tracks (status, created_at desc);
create index if not exists music_tracks_creator_idx
  on public.music_tracks (creator_id, created_at desc);

create table if not exists public.music_purchases (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.music_tracks(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  price_acoin integer not null check (price_acoin >= 0),
  purchased_at timestamptz not null default now(),
  unique (track_id, buyer_id)
);

create index if not exists music_purchases_buyer_idx
  on public.music_purchases (buyer_id, purchased_at desc);
create index if not exists music_purchases_creator_idx
  on public.music_purchases (creator_id, purchased_at desc);

create table if not exists public.music_transactions (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.music_tracks(id) on delete set null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  amount_acoin integer not null check (amount_acoin >= 0),
  created_at timestamptz not null default now()
);

alter table public.music_tracks enable row level security;
alter table public.music_purchases enable row level security;
alter table public.music_transactions enable row level security;

drop policy if exists "music published tracks are readable" on public.music_tracks;
create policy "music published tracks are readable"
  on public.music_tracks for select
  using (status = 'published' or creator_id = auth.uid());

drop policy if exists "music creators publish tracks" on public.music_tracks;
create policy "music creators publish tracks"
  on public.music_tracks for insert
  with check (creator_id = auth.uid());

drop policy if exists "music owners manage tracks" on public.music_tracks;
create policy "music owners manage tracks"
  on public.music_tracks for update
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

drop policy if exists "music purchases are visible to participants" on public.music_purchases;
create policy "music purchases are visible to participants"
  on public.music_purchases for select
  using (buyer_id = auth.uid() or creator_id = auth.uid());

drop policy if exists "music transactions are visible to participants" on public.music_transactions;
create policy "music transactions are visible to participants"
  on public.music_transactions for select
  using (buyer_id = auth.uid() or creator_id = auth.uid());

-- Audio bytes are stored in Cloudflare R2 through the authenticated uploads
-- AfuCloud Worker routes own provider-backed operations. Supabase stores only
-- the AfuMusic metadata and purchase rows.

create or replace function public.purchase_music_track(p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_track public.music_tracks%rowtype;
  v_existing public.music_purchases%rowtype;
begin
  if v_buyer is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_track
  from public.music_tracks
  where id = p_track_id and status = 'published'
  for update;

  if not found then
    raise exception 'track_not_available';
  end if;

  select * into v_existing
  from public.music_purchases
  where track_id = p_track_id and buyer_id = v_buyer
  for update;

  if found then
    return jsonb_build_object('ok', true, 'already_owned', true, 'price_acoin', v_existing.price_acoin);
  end if;

  if v_track.creator_id <> v_buyer and v_track.price_acoin > 0 then
    perform public.deduct_acoin(v_buyer, v_track.price_acoin);
    perform public.credit_acoin(v_track.creator_id, v_track.price_acoin);
  end if;

  insert into public.music_purchases (track_id, buyer_id, creator_id, price_acoin)
  values (v_track.id, v_buyer, v_track.creator_id, v_track.price_acoin);

  insert into public.music_transactions (track_id, buyer_id, creator_id, amount_acoin)
  values (v_track.id, v_buyer, v_track.creator_id, v_track.price_acoin);

  return jsonb_build_object('ok', true, 'already_owned', false, 'price_acoin', v_track.price_acoin);
end;
$$;

revoke all on function public.purchase_music_track(uuid) from public;
grant execute on function public.purchase_music_track(uuid) to authenticated;