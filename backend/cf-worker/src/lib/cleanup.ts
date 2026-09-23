import type { Env } from "../types";
import { createPublicDbClient } from "./public-db";

type ExpiredStory = {
  id: string;
  media_url?: string | null;
};

function storageKey(env: Env, mediaUrl: string | null | undefined): string | null {
  const publicBase = (env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (!publicBase || typeof mediaUrl !== "string" || !mediaUrl.startsWith(`${publicBase}/`)) {
    return null;
  }

  const key = decodeURIComponent(mediaUrl.slice(publicBase.length + 1));
  if (!key || key.split("/").includes("..")) return null;
  return key;
}

export async function cleanupExpiredStories(env: Env): Promise<{
  success: boolean;
  deleted: number;
  storage_deleted: number;
}> {
  const db = createPublicDbClient(env);
  const expiry = encodeURIComponent(new Date().toISOString());
  const stories = await db.select<ExpiredStory>(
    "stories",
    `select=id,media_url&expires_at=not.is.null&expires_at=lte.${expiry}`,
  );

  if (!stories.length) {
    return { success: true, deleted: 0, storage_deleted: 0 };
  }

  const keys = stories
    .map((story) => storageKey(env, story.media_url))
    .filter((key): key is string => Boolean(key));

  for (const key of keys) {
    await env.IMAGES_BUCKET.delete(key);
  }

  const ids = stories.map((story) => story.id);
  await db.remove(
    "stories",
    `id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`,
  );

  return {
    success: true,
    deleted: ids.length,
    storage_deleted: keys.length,
  };
}