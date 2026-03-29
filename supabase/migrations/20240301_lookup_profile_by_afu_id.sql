-- Function to look up a profile by AfuChat ID (afu_id)
-- The afu_id is derived from the first 8 hex chars of the user UUID:
--   num = parseInt(hex, 16) % 100000000
--   afu_id = num.padStart(8, '0')
CREATE OR REPLACE FUNCTION lookup_profile_by_afu_id(p_afu_id text)
RETURNS TABLE (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  bio text,
  country text,
  region text,
  is_verified boolean,
  is_organization_verified boolean,
  current_grade text,
  xp integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id, p.handle, p.display_name, p.avatar_url, p.bio,
    p.country, p.region, p.is_verified, p.is_organization_verified,
    p.current_grade, p.xp
  FROM profiles p
  WHERE (
    (('x' || substring(replace(p.id::text, '-', ''), 1, 8))::bit(32)::int8 + 4294967296) % 4294967296 % 100000000
  ) = p_afu_id::bigint
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION lookup_profile_by_afu_id(text) TO anon, authenticated;
