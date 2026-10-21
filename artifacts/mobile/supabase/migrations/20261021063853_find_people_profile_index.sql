-- Match the Find People feed's filter and last-seen ordering.
CREATE INDEX IF NOT EXISTS profiles_find_people_last_seen_idx
  ON public.profiles (last_seen DESC NULLS LAST)
  WHERE onboarding_completed = true
    AND is_banned = false
    AND account_deleted = false
    AND handle IS NOT NULL
    AND display_name IS NOT NULL
    AND avatar_url IS NOT NULL
    AND bio IS NOT NULL;

ANALYZE public.profiles;