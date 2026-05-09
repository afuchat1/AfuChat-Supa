-- Fix RLS on referrals table so referrers can see the rows they created.
-- Previously only the referred user could query these rows, leaving the
-- referral list screen blank for the person who sent the invite.

-- Re-create the SELECT policy to cover both sides of the relationship.
drop policy if exists "referrals_select_own"  on public.referrals;
drop policy if exists "Users can view their own referrals" on public.referrals;
drop policy if exists "referrals_select_referrer" on public.referrals;
drop policy if exists "referrals_select_referred" on public.referrals;

-- Single policy: either party can read their row
create policy "referrals_select_own"
  on public.referrals
  for select
  using (
    referrer_id = auth.uid()
    or referred_id = auth.uid()
  );

-- Ensure RLS is enabled on the table (safe to run multiple times)
alter table public.referrals enable row level security;
