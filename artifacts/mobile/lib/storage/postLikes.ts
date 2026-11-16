import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getLiveSupabaseSession, supabase } from "@/lib/supabase";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { getDB } from "./db";
import type { PostLikeSnapshot } from "./postLikeModel";

export type { PostLikePresentation, PostLikeSnapshot } from "./postLikeModel";
export { applyPostLikeSnapshots, resolvePostLikePresentation } from "./postLikeModel";

const WEB_KEY_PREFIX = "afuchat:post-like-state:v1:";
const webWriteQueues = new Map<string, Promise<void>>();
let connectivityUnsubscribe: (() => void) | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let syncing = false;

function webKey(userId: string): string {
  return `${WEB_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

function parseSnapshot(value: any): PostLikeSnapshot | null {
  if (
    !value ||
    typeof value.liked !== "boolean" ||
    !Number.isFinite(Number(value.likeCount)) ||
    !Number.isFinite(Number(value.updatedAt))
  ) {
    return null;
  }
  return {
    liked: value.liked,
    likeCount: Math.max(0, Math.floor(Number(value.likeCount))),
    pending: value.pending === true,
    updatedAt: Number(value.updatedAt),
  };
}

function rowToSnapshot(row: any): PostLikeSnapshot {
  return {
    liked: row.liked === 1,
    likeCount: Math.max(0, Number(row.like_count) || 0),
    pending: row.pending === 1,
    updatedAt: Number(row.updated_at) || 0,
  };
}

async function readWebStates(userId: string): Promise<Record<string, PostLikeSnapshot>> {
  try {
    const raw = await AsyncStorage.getItem(webKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, PostLikeSnapshot> = {};
    for (const [postId, value] of Object.entries(parsed)) {
      const snapshot = parseSnapshot(value);
      if (snapshot) result[postId] = snapshot;
    }
    return result;
  } catch {
    return {};
  }
}

async function mutateWebStates(
  userId: string,
  mutate: (states: Record<string, PostLikeSnapshot>) => Record<string, PostLikeSnapshot>,
): Promise<void> {
  const previous = webWriteQueues.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const states = await readWebStates(userId);
    await AsyncStorage.setItem(webKey(userId), JSON.stringify(mutate(states)));
  });
  webWriteQueues.set(userId, next);
  try {
    await next;
  } finally {
    if (webWriteQueues.get(userId) === next) webWriteQueues.delete(userId);
  }
}

export async function getPostLikeStates(
  userId: string,
  postIds?: string[],
): Promise<Map<string, PostLikeSnapshot>> {
  if (!userId || (postIds && postIds.length === 0)) return new Map();
  const wanted = postIds ? new Set(postIds) : null;

  if (Platform.OS === "web") {
    const states = await readWebStates(userId);
    return new Map(
      Object.entries(states).filter(([postId]) => !wanted || wanted.has(postId)),
    );
  }

  try {
    const db = await getDB();
    const rows = postIds
      ? await db.getAllAsync<any>(
          `SELECT post_id, liked, like_count, pending, updated_at
           FROM post_like_state
           WHERE user_id = ? AND post_id IN (${postIds.map(() => "?").join(",")})`,
          [userId, ...postIds],
        )
      : await db.getAllAsync<any>(
          `SELECT post_id, liked, like_count, pending, updated_at
           FROM post_like_state WHERE user_id = ?`,
          [userId],
        );
    return new Map(rows.map((row) => [row.post_id, rowToSnapshot(row)]));
  } catch {
    return new Map();
  }
}

async function writePostLikeState(
  userId: string,
  postId: string,
  state: PostLikeSnapshot,
): Promise<void> {
  if (!userId || !postId) return;
  if (Platform.OS === "web") {
    await mutateWebStates(userId, (states) => ({ ...states, [postId]: state }));
    return;
  }

  const db = await getDB();
  await db.runAsync(
    `INSERT INTO post_like_state (user_id, post_id, liked, like_count, pending, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, post_id) DO UPDATE SET
       liked = excluded.liked,
       like_count = excluded.like_count,
       pending = excluded.pending,
       updated_at = MAX(excluded.updated_at, post_like_state.updated_at + 1)`,
    [userId, postId, state.liked ? 1 : 0, Math.max(0, state.likeCount), state.pending ? 1 : 0, state.updatedAt],
  );
}

export async function savePostLikeIntent(
  userId: string,
  postId: string,
  liked: boolean,
  likeCount: number,
): Promise<PostLikeSnapshot> {
  if (Platform.OS === "web") {
    let snapshot: PostLikeSnapshot | null = null;
    await mutateWebStates(userId, (states) => {
      const current = states[postId];
      snapshot = {
        liked,
        likeCount: Math.max(0, Math.floor(likeCount)),
        pending: true,
        updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
      };
      return { ...states, [postId]: snapshot };
    });
    if (snapshot) return snapshot;
  }

  const current = (await getPostLikeStates(userId, [postId])).get(postId);
  await writePostLikeState(userId, postId, {
    liked,
    likeCount: Math.max(0, Math.floor(likeCount)),
    pending: true,
    updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
  });
  return (await getPostLikeStates(userId, [postId])).get(postId) ?? {
    liked,
    likeCount: Math.max(0, Math.floor(likeCount)),
    pending: true,
    updatedAt: Date.now(),
  };
}

/**
 * Persist a successful server snapshot for offline rendering. Pending local
 * actions and actions made after this request began always take precedence.
 */
export async function cacheServerPostLikeState(
  userId: string,
  postId: string,
  liked: boolean,
  likeCount: number,
  requestStartedAt: number,
): Promise<void> {
  await cacheServerPostLikeStates(
    userId,
    new Map([[postId, { liked, likeCount }]]),
    requestStartedAt,
  );
}

export async function cacheServerPostLikeStates(
  userId: string,
  serverStates: Map<string, { liked: boolean; likeCount: number }>,
  requestStartedAt: number,
): Promise<void> {
  if (!userId || serverStates.size === 0) return;

  if (Platform.OS === "web") {
    await mutateWebStates(userId, (states) => {
      const next = { ...states };
      for (const [postId, server] of serverStates) {
        const current = next[postId];
        if (current && (current.pending || current.updatedAt > requestStartedAt)) continue;
        next[postId] = {
          liked: server.liked,
          likeCount: Math.max(0, Math.floor(server.likeCount)),
          pending: false,
          updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
        };
      }
      return next;
    });
    return;
  }

  const db = await getDB();
  const entries = [...serverStates.entries()];
  await db.execAsync("BEGIN IMMEDIATE");
  try {
    for (const [postId, server] of entries) {
      await db.runAsync(
        `INSERT INTO post_like_state (user_id, post_id, liked, like_count, pending, updated_at)
         VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT(user_id, post_id) DO UPDATE SET
           liked = excluded.liked,
           like_count = excluded.like_count,
           pending = 0,
           updated_at = MAX(excluded.updated_at, post_like_state.updated_at + 1)
         WHERE post_like_state.pending = 0 AND post_like_state.updated_at <= ?`,
        [
          userId,
          postId,
          server.liked ? 1 : 0,
          Math.max(0, Math.floor(server.likeCount)),
          Date.now(),
          requestStartedAt,
        ],
      );
    }
    await db.execAsync("COMMIT");
  } catch (error) {
    try { await db.execAsync("ROLLBACK"); } catch {}
    throw error;
  }
}

async function markPostLikeSynced(
  userId: string,
  postId: string,
  actionUpdatedAt: number,
): Promise<void> {
  const confirmedAt = Date.now();
  if (Platform.OS === "web") {
    await mutateWebStates(userId, (states) => {
      const current = states[postId];
      if (!current?.pending || current.updatedAt !== actionUpdatedAt) return states;
      return {
        ...states,
        [postId]: {
          ...current,
          pending: false,
          updatedAt: Math.max(confirmedAt, current.updatedAt + 1),
        },
      };
    });
    return;
  }

  const db = await getDB();
  await db.runAsync(
    `UPDATE post_like_state
     SET pending = 0, updated_at = MAX(?, updated_at + 1)
     WHERE user_id = ? AND post_id = ? AND pending = 1 AND updated_at = ?`,
    [confirmedAt, userId, postId, actionUpdatedAt],
  );
}

function scheduleRetry(): void {
  if (retryTimer || !connectivityUnsubscribe) return;
  const delay = Math.min(15 * 60_000, 5_000 * 2 ** Math.min(retryCount, 7));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncPendingPostLikes();
  }, delay);
}

export async function syncPendingPostLikes(userId?: string): Promise<void> {
  if (syncing || !isOnline()) return;
  syncing = true;
  let failed = false;
  try {
    const session = await getLiveSupabaseSession();
    const authenticatedUserId = session?.user?.id;
    if (!authenticatedUserId || (userId && userId !== authenticatedUserId)) return;

    const pending = [...(await getPostLikeStates(authenticatedUserId)).entries()]
      .filter(([, state]) => state.pending)
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt);

    for (const [postId, state] of pending) {
      if (!isOnline()) break;
      const result = state.liked
        ? await supabase.from("post_acknowledgments").upsert(
            { post_id: postId, user_id: authenticatedUserId },
            { onConflict: "post_id,user_id", ignoreDuplicates: true },
          )
        : await supabase
            .from("post_acknowledgments")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", authenticatedUserId);

      if (result.error) {
        failed = true;
        continue;
      }
      await markPostLikeSynced(authenticatedUserId, postId, state.updatedAt);
    }

    if (failed) {
      retryCount += 1;
      scheduleRetry();
    } else {
      retryCount = 0;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    }
  } catch {
    retryCount += 1;
    scheduleRetry();
  } finally {
    syncing = false;
  }
}

export function startPostLikeSync(): void {
  if (connectivityUnsubscribe) return;
  connectivityUnsubscribe = onConnectivityChange((online) => {
    if (online) void syncPendingPostLikes();
  });
  if (isOnline()) void syncPendingPostLikes();
}

export function stopPostLikeSync(): void {
  connectivityUnsubscribe?.();
  connectivityUnsubscribe = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryCount = 0;
}
