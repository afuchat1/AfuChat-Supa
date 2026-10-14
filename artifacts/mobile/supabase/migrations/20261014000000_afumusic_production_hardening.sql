-- Reconcile the legacy production AfuMusic schema with the app's current
-- contract. This migration is additive to posts/music metadata; the only
-- existing values cleared below are public CDN links for paid tracks.

alter table public.music_tracks
  add column if not exists video_use_allowed boolean not null default false,
  add column if not exists cover_art_url text,
  add column if not exists cover_art_path text,
  add column if not exists storage_bucket text not null default 'music';

alter table public.music_tracks
  alter column audio_url drop not null,
  alter column price_acoin set default 0,
  alter column duration_seconds drop default;

update public.music_tracks
set price_acoin = 0
where price_acoin is null;

update public.music_tracks
set video_use_allowed = false
where video_use_allowed is null;

alter table public.music_tracks
  alter column price_acoin set not null,
  alter column video_use_allowed set default false,
  alter column video_use_allowed set not null;

-- Backfill object keys from this app's known public CDN URL shape so free
-- tracks can also move to authenticated playback without losing their files.
update public.music_tracks
set storage_path = regexp_replace(
  split_part(audio_url, '?', 1),
  '^https://cdn[.]afuchat[.]com/music/',
  '',
  'i'
)
where storage_path is null
  and audio_url ~* '^https://cdn[.]afuchat[.]com/music/.+';

alter table public.music_tracks
  drop constraint if exists music_tracks_afumusic_paid_price_check;
alter table public.music_tracks
  add constraint music_tracks_afumusic_paid_price_check
  check (price_acoin = 0 or price_acoin between 5 and 1000) not valid;

do $$
begin
  if exists (
    select 1
    from public.music_tracks
    where price_acoin > 0
      and (
        creator_id is null
        or storage_path is null
        or position('/' in storage_path) = 0
        or right(storage_path, 1) = '/'
        or split_part(storage_path, '/', 1) is distinct from creator_id::text
      )
  ) then
    raise exception 'Paid AfuMusic tracks must have an owner-scoped R2 storage path before privacy hardening.';
  end if;
end;
$$;

alter table public.music_tracks
  drop constraint if exists music_tracks_paid_storage_path_check;
alter table public.music_tracks
  add constraint music_tracks_paid_storage_path_check
  check (
    price_acoin = 0 or (
      creator_id is not null
      and storage_path is not null
      and position('/' in storage_path) > 0
      and right(storage_path, 1) <> '/'
      and split_part(storage_path, '/', 1) = creator_id::text
    )
  ) not valid;

-- Paid files must be served only by the authenticated /uploads/read endpoint,
-- not by the legacy public URL copied into this metadata column.
update public.music_tracks
set audio_url = null
where price_acoin > 0
  and storage_path is not null
  and audio_url is not null;

comment on column public.music_tracks.audio_url is
  'Legacy URL for free tracks only. Paid playback uses the authenticated R2 read endpoint.';

alter table public.posts
  add column if not exists music_track_id uuid references public.music_tracks(id) on delete set null,
  add column if not exists music_audio_mode text not null default 'original',
  add column if not exists music_volume real not null default 0.75,
  add column if not exists original_audio_volume real not null default 1;

alter table public.posts
  drop constraint if exists posts_music_audio_mode_check;
alter table public.posts
  add constraint posts_music_audio_mode_check
  check (music_audio_mode in ('original', 'mix', 'replace')) not valid;

alter table public.posts
  drop constraint if exists posts_music_volume_range_check;
alter table public.posts
  add constraint posts_music_volume_range_check
  check (music_volume between 0 and 1) not valid;

alter table public.posts
  drop constraint if exists posts_original_audio_volume_range_check;
alter table public.posts
  add constraint posts_original_audio_volume_range_check
  check (original_audio_volume between 0 and 1) not valid;

create index if not exists posts_music_track_idx
  on public.posts (music_track_id)
  where music_track_id is not null;

-- Remove the older permissive policy that also exposed removed catalog rows.
drop policy if exists "Anyone can view music tracks" on public.music_tracks;
drop policy if exists "music published tracks are readable" on public.music_tracks;
create policy "music published tracks are readable"
  on public.music_tracks for select
  using (status = 'published' or creator_id = auth.uid());

create or replace function public.afumusic_creator_has_premium(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_creator_id = auth.uid(), false)
    and exists (
      select 1
      from public.user_subscriptions us
      join public.subscription_plans sp on sp.id = us.plan_id
      where us.user_id = p_creator_id
        and us.is_active = true
        and us.expires_at >= now()
        and lower(coalesce(sp.tier, '')) in ('silver', 'gold', 'platinum')
    );
$$;

revoke all on function public.afumusic_creator_has_premium(uuid) from public, anon;
grant execute on function public.afumusic_creator_has_premium(uuid) to authenticated;

create or replace function public.guard_afumusic_paid_publishing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or new.creator_id is distinct from auth.uid() then
    raise exception 'afumusic_creator_mismatch';
  end if;

  if new.price_acoin is null or (new.price_acoin <> 0 and new.price_acoin not between 5 and 1000) then
    raise exception 'afumusic_paid_price_must_be_5_to_1000';
  end if;

  if new.storage_path is not null
    and (
      new.creator_id is null
      or position('/' in new.storage_path) = 0
      or right(new.storage_path, 1) = '/'
      or split_part(new.storage_path, '/', 1) is distinct from new.creator_id::text
    ) then
    raise exception 'afumusic_storage_path_owner_mismatch';
  end if;

  if new.price_acoin > 0 then
    if new.storage_bucket is distinct from 'music-private' then
      raise exception 'afumusic_paid_track_requires_private_storage';
    end if;
    if new.storage_path is null or btrim(new.storage_path) = '' then
      raise exception 'afumusic_paid_track_requires_storage_path';
    end if;
    -- Older app clients may still submit the public URL; never retain it for
    -- paid catalog entries.
    new.audio_url := null;
  end if;

  if new.price_acoin > 0 and not public.afumusic_creator_has_premium(new.creator_id) then
    raise exception 'music_paid_publishing_requires_premium';
  end if;

  return new;
end;
$$;

drop trigger if exists afumusic_paid_publishing_guard on public.music_tracks;
create trigger afumusic_paid_publishing_guard
  before insert or update of price_acoin, creator_id, audio_url, storage_path, storage_bucket
  on public.music_tracks
  for each row
  execute function public.guard_afumusic_paid_publishing();

create or replace function public.guard_afumusic_post_attachment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_track public.music_tracks%rowtype;
begin
  if new.music_track_id is null then
    return new;
  end if;

  if auth.uid() is null or new.author_id is distinct from auth.uid() then
    raise exception 'afumusic_post_author_mismatch';
  end if;

  select * into v_track
  from public.music_tracks
  where id = new.music_track_id
    and status = 'published'
  for share;

  if not found then
    raise exception 'afumusic_track_not_available';
  end if;

  if new.post_type = 'video' then
    if not v_track.video_use_allowed then
      raise exception 'afumusic_video_use_not_permitted';
    end if;
    if v_track.price_acoin > 0
      and v_track.creator_id is distinct from new.author_id
      and not exists (
        select 1
        from public.music_purchases mp
        where mp.track_id = v_track.id
          and mp.buyer_id = new.author_id
      )
    then
      raise exception 'afumusic_track_purchase_required';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists afumusic_post_attachment_guard on public.posts;
create trigger afumusic_post_attachment_guard
  before insert or update of music_track_id, post_type, author_id
  on public.posts
  for each row
  execute function public.guard_afumusic_post_attachment();

create or replace function public.afumusic_payments_ready()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null;
$$;

revoke all on function public.afumusic_payments_ready() from public, anon;
grant execute on function public.afumusic_payments_ready() to authenticated;

create or replace function public.purchase_music_track(p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_buyer uuid := auth.uid();
  v_track public.music_tracks%rowtype;
  v_existing public.music_purchases%rowtype;
  v_purchase_id uuid;
  v_debit jsonb;
  v_metadata jsonb;
begin
  if v_buyer is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_track
  from public.music_tracks
  where id = p_track_id and status = 'published'
  for update;

  if not found or v_track.creator_id is null then
    raise exception 'track_not_available';
  end if;

  if v_track.creator_id = v_buyer then
    return jsonb_build_object('ok', true, 'already_owned', true, 'price_acoin', 0);
  end if;

  select * into v_existing
  from public.music_purchases
  where track_id = p_track_id and buyer_id = v_buyer
  for update;

  if found then
    return jsonb_build_object('ok', true, 'already_owned', true, 'price_acoin', v_existing.price_acoin);
  end if;

  if v_track.price_acoin > 0 then
    v_debit := public.deduct_acoin(v_buyer, v_track.price_acoin);
    if coalesce((v_debit ->> 'success')::boolean, false) is not true then
      raise exception 'insufficient_acoin';
    end if;
    perform public.credit_acoin(v_track.creator_id, v_track.price_acoin);
  end if;

  insert into public.music_purchases (track_id, buyer_id, creator_id, price_acoin)
  values (v_track.id, v_buyer, v_track.creator_id, v_track.price_acoin)
  returning id into v_purchase_id;

  insert into public.music_transactions (track_id, buyer_id, creator_id, amount_acoin)
  values (v_track.id, v_buyer, v_track.creator_id, v_track.price_acoin);

  if v_track.price_acoin > 0 then
    v_metadata := jsonb_build_object(
      'source', 'afumusic',
      'music_purchase_id', v_purchase_id,
      'track_id', v_track.id,
      'track_title', v_track.title,
      'creator_id', v_track.creator_id,
      'buyer_id', v_buyer
    );

    insert into public.acoin_transactions (user_id, amount, transaction_type, metadata)
    values
      (v_buyer, -v_track.price_acoin, 'music_purchase', v_metadata || jsonb_build_object('counterparty_id', v_track.creator_id)),
      (v_track.creator_id, v_track.price_acoin, 'music_sale', v_metadata || jsonb_build_object('counterparty_id', v_buyer));
  end if;

  return jsonb_build_object('ok', true, 'already_owned', false, 'price_acoin', v_track.price_acoin);
end;
$$;

revoke all on function public.purchase_music_track(uuid) from public, anon;
grant execute on function public.purchase_music_track(uuid) to authenticated;
