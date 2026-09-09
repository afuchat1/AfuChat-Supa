const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://rhnsjqqtdzlkvqazfcbg.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";

export type PublicProfile = {
  id: string;
  display_name: string | null;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  country: string | null;
};

export type PublicPost = {
  id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  view_count: number | null;
  like_count: number | null;
  visibility: string;
  post_type: string | null;
  article_title: string | null;
  profiles: PublicProfile | null;
};

async function supabaseGet<T>(table: string, params: Record<string, string>) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function supabaseRpc<T>(name: string, body: Record<string, string>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    next: { revalidate: 60 }
  });

  if (!response.ok) throw new Error(`Supabase RPC ${name} request failed with ${response.status}`);
  return response.json() as Promise<T>;
}

export async function getPublicPosts(limit = 30) {
  return supabaseGet<PublicPost[]>("posts", {
    select: "id,author_id,content,image_url,created_at,view_count,like_count,visibility,post_type,article_title,profiles!posts_author_id_fkey(id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified,country)",
    visibility: "eq.public",
    order: "created_at.desc",
    limit: String(limit)
  });
}

export async function getPublicProfiles(limit = 1000) {
  return supabaseGet<Pick<PublicProfile, "id" | "handle">[]>("profiles", {
    select: "id,handle",
    order: "handle.asc",
    limit: String(limit)
  });
}

export async function getPublicProfile(handle: string) {
  const profiles = await supabaseGet<PublicProfile[]>("profiles", {
    select: "id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified,country",
    handle: `ilike.${handle}`,
    limit: "1"
  });
  return profiles[0] ?? null;
}

export async function getPublicProfileById(id: string) {
  const profiles = await supabaseGet<PublicProfile[]>("profiles", {
    select: "id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified,country",
    id: `eq.${id}`,
    limit: "1"
  });
  return profiles[0] ?? null;
}

export async function getPublicProfileByAfuId(afuId: string) {
  const result = await supabaseRpc<PublicProfile[]>("lookup_profile_by_afu_id", {
    p_afu_id: afuId.padStart(8, "0")
  });
  return result[0] ?? null;
}

export async function getProfilePosts(authorId: string, limit = 24) {
  return supabaseGet<PublicPost[]>("posts", {
    select: "id,author_id,content,image_url,created_at,view_count,like_count,visibility,post_type,article_title",
    author_id: `eq.${authorId}`,
    visibility: "eq.public",
    order: "created_at.desc",
    limit: String(limit)
  });
}

export async function getPublicPost(id: string) {
  const posts = await supabaseGet<PublicPost[]>("posts", {
    select: "id,author_id,content,image_url,created_at,view_count,like_count,visibility,post_type,article_title,profiles!posts_author_id_fkey(id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified,country)",
    id: `eq.${id}`,
    visibility: "eq.public",
    limit: "1"
  });
  return posts[0] ?? null;
}

export type PublicCommunity = {
  id: string;
  name: string | null;
  handle: string | null;
  description: string | null;
  avatar_url: string | null;
  is_public?: boolean;
  is_group?: boolean;
  is_channel?: boolean;
};

export async function getPublicChannel(id: string) {
  const channels = await supabaseGet<PublicCommunity[]>("channels", {
    select: "id,name,handle,description,avatar_url,is_public",
    id: `eq.${id}`,
    is_public: "eq.true",
    limit: "1"
  });
  return channels[0] ?? null;
}

export async function getPublicGroup(id: string) {
  const groups = await supabaseGet<PublicCommunity[]>("chats", {
    select: "id,name,handle,is_group,is_channel",
    id: `eq.${id}`,
    is_group: "eq.true",
    is_channel: "eq.false",
    limit: "1"
  });
  return groups[0] ?? null;
}