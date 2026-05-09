-- Ensure the referrals table exists with all required columns.
-- The table may have been created directly in Supabase without a migration,
-- so we use CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS to be safe.

create table if not exists public.referrals (
  id          uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Add reward_given column if the table already existed without it
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'referrals'
      and column_name  = 'reward_given'
  ) then
    alter table public.referrals add column reward_given boolean not null default false;
  end if;
end
$$;

-- Back-fill any existing rows (reward was given at insert time, so treat all as given)
update public.referrals set reward_given = true where reward_given = false;

-- Indexes for fast look-ups from both sides
create index if not exists referrals_referrer_idx on public.referrals(referrer_id);
create index if not exists referrals_referred_idx on public.referrals(referred_id);

-- RLS
alter table public.referrals enable row level security;

drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own"
  on public.referrals for select
  using (referrer_id = auth.uid() or referred_id = auth.uid());

drop policy if exists "referrals_insert_self" on public.referrals;
create policy "referrals_insert_self"
  on public.referrals for insert
  with check (referred_id = auth.uid());
