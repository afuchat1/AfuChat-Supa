import { supabase } from "@/lib/supabase";
import { searchMusicTracksByIds } from "@/lib/afuMusic";

type SearchRow = { source_type: string; source_id: string; score: number };

type ContextItem = {
  sourceType: string;
  score: number;
  content: string;
};

const PUBLIC_SEARCH_TYPES = [
  "profile",
  "organization_page",
  "post",
  "video",
  "channel",
  "group",
  "event",
  "gift",
  "job",
  "product",
  "freelance",
  "paid_community",
  "music",
];

function cleanText(value: unknown, limit = 420): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

/**
 * Retrieve query-relevant public AfuChat content using the existing authenticated
 * search index. Each result is then re-read with the same public filters used by
 * AfuSearch; no service-role access or private-table reads are used here.
 */
export async function getAfuAiPublicContext(query: string): Promise<string> {
  const searchText = cleanText(query, 180);
  if (searchText.length < 2) return "";

  const { data, error } = await supabase.rpc("search_public_content", {
    p_query: searchText,
    p_types: PUBLIC_SEARCH_TYPES,
    p_limit_per_type: 2,
    p_since: null,
    p_verified_only: false,
    p_sort_mode: "relevance",
  });
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : [])
    .filter((row: any) => row?.source_id && PUBLIC_SEARCH_TYPES.includes(row?.source_type))
    .map((row: any) => ({
      source_type: String(row.source_type),
      source_id: String(row.source_id),
      score: Number(row.score) || 0,
    })) as SearchRow[];

  if (!rows.length) return "";

  const idsFor = (type: string) =>
    rows.filter((row) => row.source_type === type).map((row) => row.source_id);
  const scoreFor = (type: string, id: string) =>
    rows.find((row) => row.source_type === type && row.source_id === id)?.score ?? 0;
  const items: ContextItem[] = [];
  const failedTypes: string[] = [];

  async function loadCategory(
    type: string,
    load: (ids: string[]) => any,
    format: (row: any) => string,
  ) {
    const ids = idsFor(type);
    if (!ids.length) return;
    try {
      const { data: categoryData, error: categoryError } = await load(ids);
      if (categoryError) throw categoryError;
      for (const row of categoryData || []) {
        if (!row?.id) continue;
        const content = format(row);
        if (content) items.push({ sourceType: type, score: scoreFor(type, String(row.id)), content });
      }
    } catch (categoryError) {
      console.warn(`[AfuAI/public-search] Could not load ${type} results`, categoryError);
      failedTypes.push(type);
    }
  }

  const profileLine = (row: any) => {
    if (row.is_private || !row.handle) return "";
    const details = [
      row.bio ? `Bio: ${cleanText(row.bio, 240)}` : "",
      row.is_verified ? "Verified" : "",
      row.avatar_url ? `Avatar URL: ${cleanText(row.avatar_url, 500)}` : "",
    ].filter(Boolean).join(" · ");
    return `[Public profile] ${cleanText(row.display_name || row.handle, 120)} (@${cleanText(row.handle, 40)})${details ? ` — ${details}` : ""}`;
  };

  await Promise.all([
    loadCategory(
      "profile",
      (ids) => supabase.rpc("get_public_search_profiles", { p_ids: ids }),
      profileLine,
    ),
    loadCategory(
      "organization_page",
      (ids) => supabase.from("organization_pages")
        .select("id, name, slug, description, logo_url")
        .in("id", ids),
      (row) => `[Public organization] ${cleanText(row.name, 120)}${row.slug ? ` (@${cleanText(row.slug, 60)})` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}${row.logo_url ? ` [Logo URL: ${cleanText(row.logo_url, 500)}]` : ""}`,
    ),
    loadCategory(
      "post",
      (ids) => supabase.from("posts")
        .select("id, content, article_title, image_url, post_type")
        .in("id", ids)
        .eq("visibility", "public")
        .or("is_blocked.is.null,is_blocked.eq.false")
        .neq("post_type", "video"),
      (row) => {
        const summary = cleanText(row.article_title || row.content);
        if (!summary) return "";
        const image = cleanText(row.image_url, 500);
        return `[Public post] ${summary}${image ? ` [Image URL: ${image}]` : ""}`;
      },
    ),
    loadCategory(
      "video",
      (ids) => supabase.from("posts")
        .select("id, content, video_url, image_url, audio_name")
        .in("id", ids)
        .eq("post_type", "video")
        .eq("visibility", "public")
        .or("is_blocked.is.null,is_blocked.eq.false")
        .not("video_url", "is", null),
      (row) => {
        const summary = cleanText(row.content || row.audio_name);
        if (!summary) return "";
        const image = cleanText(row.image_url, 500);
        return `[Public video] ${summary}${image ? ` [Thumbnail URL: ${image}]` : ""}`;
      },
    ),
    loadCategory(
      "channel",
      (ids) => supabase.from("channels")
        .select("id, name, handle, description, subscriber_count, avatar_url")
        .in("id", ids)
        .eq("is_public", true),
      (row) => `[Public channel] ${cleanText(row.name, 120)}${row.handle ? ` (@${cleanText(row.handle, 60)})` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}${row.avatar_url ? ` [Image URL: ${cleanText(row.avatar_url, 500)}]` : ""}`,
    ),
    loadCategory(
      "group",
      (ids) => supabase.from("chats")
        .select("id, name, handle, description, avatar_url")
        .in("id", ids)
        .eq("is_group", true)
        .eq("is_private", false)
        .or("is_channel.is.null,is_channel.eq.false"),
      (row) => `[Public group] ${cleanText(row.name, 120)}${row.handle ? ` (@${cleanText(row.handle, 60)})` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}${row.avatar_url ? ` [Image URL: ${cleanText(row.avatar_url, 500)}]` : ""}`,
    ),
    loadCategory(
      "event",
      (ids) => supabase.from("digital_events")
        .select("id, title, description, event_date, category")
        .in("id", ids)
        .eq("is_active", true)
        .gte("event_date", new Date().toISOString()),
      (row) => `[Public event] ${cleanText(row.title, 140)}${row.category ? ` (${cleanText(row.category, 60)})` : ""}${row.event_date ? ` — ${cleanText(row.event_date, 50)}` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}`,
    ),
    loadCategory(
      "gift",
      (ids) => supabase.from("gifts")
        .select("id, name, emoji, description, rarity")
        .in("id", ids),
      (row) => `[Gift catalog] ${cleanText(row.emoji, 8)} ${cleanText(row.name, 100)}${row.rarity ? ` (${cleanText(row.rarity, 40)})` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}`,
    ),
    loadCategory(
      "job",
      (ids) => supabase.from("org_page_jobs")
        .select("id, title, job_type, location, description")
        .in("id", ids)
        .eq("is_active", true),
      (row) => `[Public job] ${cleanText(row.title, 140)}${row.job_type ? ` (${cleanText(row.job_type, 40)})` : ""}${row.location ? ` — ${cleanText(row.location, 80)}` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}`,
    ),
    loadCategory(
      "product",
      (ids) => supabase.from("shop_products")
        .select("id, name, description, images, price_acoin")
        .in("id", ids)
        .eq("is_available", true),
      (row) => {
        const image = Array.isArray(row.images) ? cleanText(row.images[0], 500) : "";
        return `[Public product] ${cleanText(row.name, 140)}${row.price_acoin != null ? ` — ${cleanText(row.price_acoin, 40)} ACoin` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}${image ? ` [Image URL: ${image}]` : ""}`;
      },
    ),
    loadCategory(
      "freelance",
      (ids) => supabase.from("freelance_listings")
        .select("id, title, description, price, emoji")
        .in("id", ids)
        .eq("is_active", true),
      (row) => `[Public freelance listing] ${cleanText(row.emoji, 8)} ${cleanText(row.title, 140)}${row.price != null ? ` — ${cleanText(row.price, 60)}` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}`,
    ),
    loadCategory(
      "paid_community",
      (ids) => supabase.from("paid_communities")
        .select("id, name, description, emoji, price")
        .in("id", ids)
        .eq("is_active", true),
      (row) => `[Public paid community] ${cleanText(row.emoji, 8)} ${cleanText(row.name, 120)}${row.price != null ? ` — ${cleanText(row.price, 60)}` : ""}${row.description ? ` — ${cleanText(row.description)}` : ""}`,
    ),
    loadCategory(
      "music",
      (ids) => searchMusicTracksByIds(ids).then((music) => ({ data: music, error: null })),
      (row) => `[Published music track] ${cleanText(row.title, 140)} by ${cleanText(row.artist, 100)}${row.genre ? ` (${cleanText(row.genre, 60)})` : ""}${row.coverUrl ? ` [Cover URL: ${cleanText(row.coverUrl, 500)}]` : ""}`,
    ),
  ]);

  const context = items
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item, index) => `${index + 1}. ${item.content}`)
    .join("\n");
  const partialNotice = failedTypes.length
    ? `\n(Some public categories could not be loaded: ${[...new Set(failedTypes)].join(", ")}.)`
    : "";
  return context ? `${context}${partialNotice}` : "";
}
