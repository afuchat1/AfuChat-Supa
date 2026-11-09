// ─── Permanent Feed Post Store ──────────────────────────────────────────────────
// Feed posts are stored permanently on device once downloaded/viewed.
// Delta sync: only posts NEWER than the newest stored post_id are fetched.
// Already-stored posts are never re-downloaded.
//
// RULES:
//   • INSERT OR IGNORE — a post stored once is never overwritten/re-fetched
//   • No TTL, no auto-trim — posts accumulate until user clears storage
//   • getNewestFeedPostDate(tab) → cursor for delta sync (only fetch newer)
//   • updateLocalPost* helpers update reactive state (likes, bookmarks) without re-fetching

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
  stored_at: number;
};

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
    stored_at: Date.now(),
  };
}

// ─── Reads ──────────────────────────────────────────────────────────────────────

/**
 * Load stored feed posts for a tab. Returns most recent first by default.
 * No TTL — returns everything stored, not just "fresh" data.
 */
export async function getLocalFeedPosts(
  tab: FeedTab,
  limit = 50,
  beforeCreatedAt?: string,
): Promise<LocalPost[]> {
  try {
    const db = await getDB();
    let rows: any[];
    if (beforeCreatedAt) {
      rows = await db.getAllAsync<any>(
        `SELECT * FROM feed_posts WHERE tab = ? AND created_at < ?
         ORDER BY created_at DESC LIMIT ?`,
        [tab, beforeCreatedAt, limit],
      );
    } else {
      rows = await db.getAllAsync<any>(
        `SELECT * FROM feed_posts WHERE tab = ?
         ORDER BY created_at DESC LIMIT ?`,
        [tab, limit],
      );
    }
    return rows.map(rowToPost);
  } catch {
    return [];
  }
}

/**
 * Returns the created_at of the NEWEST post stored for this tab.
 * Used as the delta-sync cursor: only fetch posts with created_at > this value.
 */
export async function getNewestFeedPostDate(tab: FeedTab): Promise<string | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ created_at: string }>(
      "SELECT created_at FROM feed_posts WHERE tab = ? ORDER BY created_at DESC LIMIT 1",
      [tab],
    );
    return row?.created_at ?? null;
  } catch {
    return null;
  }
}

export async function getLocalFeedPostCount(tab: FeedTab): Promise<number> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM feed_posts WHERE tab = ?",
      [tab],
    );
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

export async function hasLocalFeedPosts(tab: FeedTab): Promise<boolean> {
  return (await getLocalFeedPostCount(tab)) > 0;
}

export async function getLocalFeedPost(id: string): Promise<LocalPost | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<any>("SELECT * FROM feed_posts WHERE id = ?", [id]);
    return row ? rowToPost(row) : null;
  } catch {
    return null;
  }
}

// ─── Writes ─────────────────────────────────────────────────────────────────────

/**
 * Save posts permanently. INSERT OR IGNORE ensures a post already on device
 * is never overwritten — it was already downloaded, no need to do it again.
 */
export async function saveFeedPosts(posts: any[], tab: FeedTab): Promise<void> {
  if (!posts.length) return;
  try {
    const db = await getDB();
    const now = Date.now();
    for (const item of posts) {
      const p = mapPost(item, tab);
      await db.runAsync(
        `INSERT OR IGNORE INTO feed_posts
         (id, author_id, content, image_url, images, video_url, post_type, article_title,
          created_at, like_count, reply_count, view_count, liked, bookmarked,
          author_name, author_handle, author_avatar, is_verified, is_org_verified,
          tab, score, stored_at)
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
  } catch {}
}

// ─── Reactive updates (no re-fetch needed) ──────────────────────────────────────

export async function updateLocalPostLike(
  postId: string,
  liked: boolean,
  likeCount: number,
): Promise<void> {
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

export async function incrementLocalPostView(postId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE feed_posts SET view_count = view_count + 1, viewed_at = ? WHERE id = ?",
      [Date.now(), postId],
    );
  } catch {}
}

/** User-initiated: delete ALL stored feed posts (both tabs). */
export async function clearAllFeedPosts(): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM feed_posts");
  } catch {}
}

/** User-initiated: delete stored posts for one tab. */
export async function clearFeedPosts(tab: FeedTab): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM feed_posts WHERE tab = ?", [tab]);
  } catch {}
}

// ─── Internal ───────────────────────────────────────────────────────────────────

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
