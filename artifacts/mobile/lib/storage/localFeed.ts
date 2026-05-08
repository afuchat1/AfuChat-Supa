import { getDB } from "./db";

export type FeedTab = "for_you" | "following";

export type LocalPost = {
  id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  images: string[];
  video_url: string | null;
  post_type: string;
  article_title: string | null;
  created_at: string;
  like_count: number;
  reply_count: number;
  view_count: number;
  liked: boolean;
  bookmarked: boolean;
  author_name: string | null;
  author_handle: string | null;
  author_avatar: string | null;
  is_verified: boolean;
  is_org_verified: boolean;
  tab: FeedTab;
  score: number;
  cached_at: number;
};

const FEED_TTL_MS = 45 * 60 * 1000; // 45 min
const MAX_FEED_POSTS = 150;

function mapPost(item: any, tab: FeedTab): LocalPost {
  const profile = item.profile ?? {};
  return {
    id: item.id,
    author_id: item.author_id,
    content: item.content ?? null,
    image_url: item.image_url ?? null,
    images: Array.isArray(item.images) ? item.images : [],
    video_url: item.video_url ?? null,
    post_type: item.post_type ?? "text",
    article_title: item.article_title ?? null,
    created_at: item.created_at,
    like_count: item.likeCount ?? item.like_count ?? 0,
    reply_count: item.replyCount ?? item.reply_count ?? 0,
    view_count: item.view_count ?? 0,
    liked: item.liked ?? false,
    bookmarked: item.bookmarked ?? false,
    author_name: profile.display_name ?? item.author_name ?? null,
    author_handle: profile.handle ?? item.author_handle ?? null,
    author_avatar: profile.avatar_url ?? item.author_avatar ?? null,
    is_verified: item.is_verified ?? false,
    is_org_verified: item.is_organization_verified ?? item.is_org_verified ?? false,
    tab,
    score: item.score ?? 0,
    cached_at: Date.now(),
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────────

export async function getLocalFeedPosts(tab: FeedTab, limit = 30): Promise<LocalPost[]> {
  try {
    const db = await getDB();
    const cutoff = Date.now() - FEED_TTL_MS;
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM feed_posts
       WHERE tab = ? AND cached_at > ?
       ORDER BY score DESC, created_at DESC
       LIMIT ?`,
      [tab, cutoff, limit],
    );
    return rows.map(rowToPost);
  } catch {
    return [];
  }
}

export async function hasLocalFeedPosts(tab: FeedTab): Promise<boolean> {
  try {
    const db = await getDB();
    const cutoff = Date.now() - FEED_TTL_MS;
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM feed_posts WHERE tab = ? AND cached_at > ?",
      [tab, cutoff],
    );
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Writes ────────────────────────────────────────────────────────────────────

export async function saveFeedPosts(posts: any[], tab: FeedTab): Promise<void> {
  if (!posts.length) return;
  try {
    const db = await getDB();
    const now = Date.now();
    for (const item of posts) {
      const p = mapPost(item, tab);
      await db.runAsync(
        `INSERT OR REPLACE INTO feed_posts
         (id, author_id, content, image_url, images, video_url, post_type, article_title,
          created_at, like_count, reply_count, view_count, liked, bookmarked,
          author_name, author_handle, author_avatar, is_verified, is_org_verified,
          tab, score, cached_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.id, p.author_id, p.content, p.image_url,
          JSON.stringify(p.images), p.video_url, p.post_type, p.article_title,
          p.created_at, p.like_count, p.reply_count, p.view_count,
          p.liked ? 1 : 0, p.bookmarked ? 1 : 0,
          p.author_name, p.author_handle, p.author_avatar,
          p.is_verified ? 1 : 0, p.is_org_verified ? 1 : 0,
          p.tab, p.score, now,
        ],
      );
    }
    // Keep only the freshest MAX_FEED_POSTS per tab
    await db.runAsync(
      `DELETE FROM feed_posts WHERE tab = ? AND id NOT IN (
         SELECT id FROM feed_posts WHERE tab = ? ORDER BY score DESC, created_at DESC LIMIT ?
       )`,
      [tab, tab, MAX_FEED_POSTS],
    );
  } catch {}
}

export async function updateLocalPostLike(postId: string, liked: boolean, likeCount: number): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE feed_posts SET liked = ?, like_count = ? WHERE id = ?",
      [liked ? 1 : 0, likeCount, postId],
    );
  } catch {}
}

export async function updateLocalPostBookmark(postId: string, bookmarked: boolean): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE feed_posts SET bookmarked = ? WHERE id = ?",
      [bookmarked ? 1 : 0, postId],
    );
  } catch {}
}

export async function clearFeedCache(tab?: FeedTab): Promise<void> {
  try {
    const db = await getDB();
    if (tab) {
      await db.runAsync("DELETE FROM feed_posts WHERE tab = ?", [tab]);
    } else {
      await db.runAsync("DELETE FROM feed_posts");
    }
  } catch {}
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function rowToPost(r: any): LocalPost {
  return {
    ...r,
    images: (() => { try { return JSON.parse(r.images ?? "[]"); } catch { return []; } })(),
    liked: r.liked === 1,
    bookmarked: r.bookmarked === 1,
    is_verified: r.is_verified === 1,
    is_org_verified: r.is_org_verified === 1,
  };
}
