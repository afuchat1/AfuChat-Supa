-- AfuMovies lives in its own schema inside the existing `afuchat` project.
-- This migration is additive; it does not alter or remove existing schemas.

begin;

create schema if not exists afumovies;

grant usage on schema afumovies to anon, authenticated, service_role;

create table if not exists afumovies.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists afumovies.movies (
  id uuid primary key default gen_random_uuid(),
  tmdb_id bigint not null unique,
  title text not null,
  overview text not null default '',
  release_date date,
  poster_path text,
  backdrop_path text,
  runtime_minutes integer check (runtime_minutes is null or runtime_minutes > 0),
  genres text[] not null default '{}',
  original_language text,
  tmdb_attribution_url text not null default 'https://www.themoviedb.org/',
  created_by uuid references afumovies.user_profiles(user_id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists afumovies.vj_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  region text not null default 'Uganda',
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists afumovies.video_versions (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references afumovies.movies(id) on delete cascade,
  vj_profile_id uuid not null references afumovies.vj_profiles(id) on delete restrict,
  version_label text not null default '',
  quality_p smallint not null check (quality_p in (360, 480)),
  r2_object_key text not null unique,
  upload_request_id text not null unique,
  mime_type text not null default 'video/mp4' check (mime_type = 'video/mp4'),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  status text not null default 'draft'
    check (status in ('draft', 'uploading', 'uploaded', 'validating', 'ready', 'published', 'failed', 'unavailable')),
  is_available boolean not null default false,
  validation_message text,
  created_by uuid not null references afumovies.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists afumovies.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references afumovies.movies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create table if not exists afumovies.playback_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_version_id uuid not null references afumovies.video_versions(id) on delete cascade,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_version_id)
);

create index if not exists movies_release_date_idx on afumovies.movies (release_date desc);

create index if not exists movies_title_search_idx on afumovies.movies using gin (to_tsvector('simple', title));

create index if not exists video_versions_movie_visibility_idx
  on afumovies.video_versions (movie_id, status, is_available, quality_p);

create index if not exists video_versions_vj_idx on afumovies.video_versions (vj_profile_id);

create index if not exists video_versions_movie_quality_idx
  on afumovies.video_versions (movie_id, quality_p, created_at desc);

create index if not exists playback_progress_user_updated_idx
  on afumovies.playback_progress (user_id, updated_at desc);

create or replace function afumovies.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on afumovies.user_profiles;

create trigger user_profiles_set_updated_at before update on afumovies.user_profiles
for each row execute function afumovies.set_updated_at();

drop trigger if exists movies_set_updated_at on afumovies.movies;

create trigger movies_set_updated_at before update on afumovies.movies
for each row execute function afumovies.set_updated_at();

drop trigger if exists vj_profiles_set_updated_at on afumovies.vj_profiles;

create trigger vj_profiles_set_updated_at before update on afumovies.vj_profiles
for each row execute function afumovies.set_updated_at();

drop trigger if exists video_versions_set_updated_at on afumovies.video_versions;

create trigger video_versions_set_updated_at before update on afumovies.video_versions
for each row execute function afumovies.set_updated_at();

create or replace function afumovies.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into afumovies.user_profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists afumovies_create_profile on auth.users;

create trigger afumovies_create_profile after insert on auth.users
for each row execute function afumovies.handle_new_user();

create or replace function afumovies.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from afumovies.user_profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function afumovies.is_admin() from public;

grant execute on function afumovies.is_admin() to authenticated;

create or replace function afumovies.discover_movies(
  p_query text default null,
  p_genre text default null,
  p_movie_id uuid default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  tmdb_id bigint,
  title text,
  overview text,
  release_date date,
  poster_path text,
  backdrop_path text,
  runtime_minutes integer,
  genres text[],
  versions jsonb
)
language sql
stable
security invoker
set search_path = afumovies, pg_temp
as $$
  select
    m.id,
    m.tmdb_id,
    m.title,
    m.overview,
    m.release_date,
    m.poster_path,
    m.backdrop_path,
    m.runtime_minutes,
    m.genres,
    jsonb_agg(
      jsonb_build_object(
        'id', vv.id,
        'vj_profile_id', vv.vj_profile_id,
        'vj_name', vj.name,
        'quality_p', vv.quality_p,
        'duration_seconds', vv.duration_seconds,
        'version_label', vv.version_label
      )
      order by vv.quality_p, vj.name
    ) as versions
  from afumovies.movies m
  join afumovies.video_versions vv
    on vv.movie_id = m.id
   and vv.status = 'published'
   and vv.is_available
  join afumovies.vj_profiles vj
    on vj.id = vv.vj_profile_id
   and vj.is_active
  where (p_movie_id is null or m.id = p_movie_id)
    and (nullif(trim(p_query), '') is null or m.title ilike '%' || trim(p_query) || '%')
    and (nullif(trim(p_genre), '') is null or trim(p_genre) = any(m.genres))
  group by m.id
  order by m.release_date desc nulls last, m.title
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function afumovies.discover_movies(text, text, uuid, integer, integer) from public;

grant execute on function afumovies.discover_movies(text, text, uuid, integer, integer) to anon, authenticated;

create or replace function afumovies.publish_video_version_from_backend(
  p_version_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movie_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from afumovies.user_profiles
    where user_id = p_actor_id and role = 'admin'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select movie_id into v_movie_id
  from afumovies.video_versions
  where id = p_version_id
  for update;

  if v_movie_id is null then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;

  perform 1 from afumovies.movies where id = v_movie_id for update;

  update afumovies.video_versions
  set status = 'published',
      is_available = true,
      validation_message = null,
      published_at = now(),
      updated_at = now()
  where id = p_version_id
    and status = 'ready'
    and file_size_bytes > 0;

  if not found then
    raise exception 'version_not_ready' using errcode = '23514';
  end if;

  update afumovies.movies
  set published_at = coalesce(published_at, now()),
      updated_at = now()
  where id = v_movie_id;
end;
$$;

revoke all on function afumovies.publish_video_version_from_backend(uuid, uuid) from public, anon, authenticated;

grant execute on function afumovies.publish_video_version_from_backend(uuid, uuid) to service_role;

create or replace function afumovies.mark_version_unavailable_from_backend(
  p_version_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movie_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from afumovies.user_profiles
    where user_id = p_actor_id and role = 'admin'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select movie_id into v_movie_id
  from afumovies.video_versions
  where id = p_version_id
  for update;

  if v_movie_id is null then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;

  perform 1 from afumovies.movies where id = v_movie_id for update;

  update afumovies.video_versions
  set status = 'unavailable',
      is_available = false,
      updated_at = now()
  where id = p_version_id;
end;
$$;

revoke all on function afumovies.mark_version_unavailable_from_backend(uuid, uuid) from public, anon, authenticated;

grant execute on function afumovies.mark_version_unavailable_from_backend(uuid, uuid) to service_role;

create or replace function afumovies.save_playback_progress(
  p_video_version_id uuid,
  p_position_seconds integer,
  p_duration_seconds integer
)
returns void
language plpgsql
security invoker
set search_path = afumovies, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from afumovies.video_versions vv
    where vv.id = p_video_version_id
      and vv.status = 'published'
      and vv.is_available
  ) then
    raise exception 'version_unavailable' using errcode = 'P0002';
  end if;

  insert into afumovies.playback_progress (
    user_id, video_version_id, position_seconds, duration_seconds
  )
  values (
    auth.uid(),
    p_video_version_id,
    greatest(coalesce(p_position_seconds, 0), 0),
    nullif(greatest(coalesce(p_duration_seconds, 0), 0), 0)
  )
  on conflict (user_id, video_version_id)
  do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    updated_at = now();
end;
$$;

revoke all on function afumovies.save_playback_progress(uuid, integer, integer) from public;

grant execute on function afumovies.save_playback_progress(uuid, integer, integer) to authenticated;

alter table afumovies.user_profiles enable row level security;

alter table afumovies.movies enable row level security;

alter table afumovies.vj_profiles enable row level security;

alter table afumovies.video_versions enable row level security;

alter table afumovies.favorites enable row level security;

alter table afumovies.playback_progress enable row level security;

drop policy if exists "profile owner or admin reads profiles" on afumovies.user_profiles;

create policy "profile owner or admin reads profiles"
  on afumovies.user_profiles for select
  using (user_id = auth.uid() or afumovies.is_admin());

drop policy if exists "profile owner updates display name" on afumovies.user_profiles;

create policy "profile owner updates display name"
  on afumovies.user_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = 'viewer');

drop policy if exists "viewers see movies with a published version" on afumovies.movies;

create policy "viewers see movies with a published version"
  on afumovies.movies for select
  using (
    afumovies.is_admin()
    or exists (
      select 1 from afumovies.video_versions vv
      join afumovies.vj_profiles vj on vj.id = vv.vj_profile_id
      where vv.movie_id = movies.id
        and vv.status = 'published'
        and vv.is_available
        and vj.is_active
    )
  );

drop policy if exists "viewers see published available versions" on afumovies.video_versions;

create policy "viewers see published available versions"
  on afumovies.video_versions for select
  using (
    afumovies.is_admin()
    or (status = 'published' and is_available)
  );

drop policy if exists "viewers see active VJs with published versions" on afumovies.vj_profiles;

create policy "viewers see active VJs with published versions"
  on afumovies.vj_profiles for select
  using (
    afumovies.is_admin()
    or (
      is_active
      and exists (
        select 1 from afumovies.video_versions vv
        where vv.vj_profile_id = vj_profiles.id
          and vv.status = 'published'
          and vv.is_available
      )
    )
  );

drop policy if exists "users manage their own favorites" on afumovies.favorites;

create policy "users manage their own favorites"
  on afumovies.favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users manage their own playback progress" on afumovies.playback_progress;

create policy "users manage their own playback progress"
  on afumovies.playback_progress for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from afumovies.video_versions vv
      where vv.id = playback_progress.video_version_id
        and vv.status = 'published'
        and vv.is_available
    )
  );

grant select on afumovies.user_profiles to authenticated;

grant update (display_name) on afumovies.user_profiles to authenticated;

grant select on afumovies.movies, afumovies.video_versions, afumovies.vj_profiles to anon, authenticated;

grant select, insert, delete on afumovies.favorites to authenticated;

grant select, insert, update, delete on afumovies.playback_progress to authenticated;

-- Make the product schema available to PostgREST without removing the project's
-- existing default schemas. The migration is additive within the existing project.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, afumovies';

notify pgrst, 'reload config';

comment on schema afumovies is 'AfuMovies application data isolated within the existing afuchat Supabase project.';

comment on table afumovies.video_versions is 'One independently managed VJ/quality object. Viewer access requires published status and is_available=true.';

commit;
