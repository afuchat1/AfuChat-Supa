-- Link licensed AfuMusic records to posts and Shots. Existing posts keep their
-- original audio behavior; new attachments must pass the rights and ownership
-- checks below before they are saved.

alter table public.music_tracks
  add column if not exists video_use_allowed boolean not null default false;

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

create or replace function public.guard_afumusic_post_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
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
