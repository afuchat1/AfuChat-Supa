import { supabase } from "@/lib/supabase";

export type SharedProfile = {
  id: string;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  is_verified?: boolean | null;
  is_organization_verified?: boolean | null;
  country?: string | null;
  interests?: string[] | null;
  hide_posts_non_followers?: boolean | null;
  hide_followers_list?: boolean | null;
  hide_following_list?: boolean | null;
  is_private?: boolean | null;
  follower_count?: number | null;
  following_count?: number | null;
  last_seen?: string | null;
  show_online_status?: boolean | null;
};

export const ACCOUNT_PROFILE_FEED_COLUMNS =
  "id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified,country,interests,hide_posts_non_followers";
export const ACCOUNT_PROFILE_FOLLOWER_COLUMNS =
  "id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified";
export const ACCOUNT_PROFILE_CHAT_COLUMNS =
  "id,display_name,avatar_url,handle";
export const ACCOUNT_PROFILE_PRIVACY_COLUMNS =
  "id,hide_followers_list,hide_following_list";

export async function fetchAccountProfileMap<T extends { id: string } = SharedProfile>(
  ids: readonly string[],
  columns: string,
): Promise<{ profiles: Map<string, T>; error: unknown | null }> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => !!id)));
  if (uniqueIds.length === 0) {
    return { profiles: new Map<string, T>(), error: null };
  }

  const { data, error } = await supabase
    .schema("accounts")
    .from("profiles")
    .select(columns)
    .in("id", uniqueIds);

  const profiles = new Map<string, T>();
  for (const profile of (data ?? []) as unknown as T[]) {
    profiles.set(profile.id, profile);
  }
  return { profiles, error };
}
