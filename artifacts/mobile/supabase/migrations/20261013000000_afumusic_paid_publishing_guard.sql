-- Restrict paid AfuMusic uploads at the trusted database boundary. The trigger
-- deliberately leaves existing catalog rows untouched and validates a price
-- only when a row is created or its price/creator is changed.

create or replace function public.afumusic_creator_has_premium(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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

revoke all on function public.afumusic_creator_has_premium(uuid) from public;
grant execute on function public.afumusic_creator_has_premium(uuid) to authenticated;

create or replace function public.guard_afumusic_paid_publishing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_acoin is null then
    raise exception 'afumusic_paid_price_must_be_5_to_1000';
  end if;

  if new.price_acoin = 0 then
    return new;
  end if;

  if new.price_acoin < 5 or new.price_acoin > 1000 then
    raise exception 'afumusic_paid_price_must_be_5_to_1000';
  end if;

  if auth.uid() is null or new.creator_id is distinct from auth.uid() then
    raise exception 'afumusic_creator_mismatch';
  end if;

  if not public.afumusic_creator_has_premium(new.creator_id) then
    raise exception 'music_paid_publishing_requires_premium';
  end if;

  return new;
end;
$$;

drop trigger if exists afumusic_paid_publishing_guard on public.music_tracks;
create trigger afumusic_paid_publishing_guard
  before insert or update of price_acoin, creator_id
  on public.music_tracks
  for each row
  execute function public.guard_afumusic_paid_publishing();
