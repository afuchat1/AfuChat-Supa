import type { Env } from "../types";
import { createPublicDbClient } from "./public-db";

type ExpiredStory = {
  id: string;
  media_url?: string | null;
};

function storageKey(env: Env, mediaUrl: string | null | undefined): string | null {
  if (typeof mediaUrl !== "string" || !mediaUrl) return null;

  let url: URL;
  try {
    url = new URL(mediaUrl);
  } catch {
    return null;
  }

  const configuredBase = env.R2_PUBLIC_URL ? new URL(env.R2_PUBLIC_URL) : null;
  const configuredPath = configuredBase?.pathname.replace(/\/+$/, "") || "";
  const configuredPrefix = `${configuredPath}/`;
  let encodedKey: string | null = null;

  if (
    configuredBase &&
    url.origin === configuredBase.origin &&
    (configuredPath === "" || url.pathname.startsWith(configuredPrefix))
  ) {
    encodedKey = configuredPath
      ? url.pathname.slice(configuredPrefix.length)
      : url.pathname.replace(/^\/+/, "");
  } else if (url.hostname.toLowerCase() === "cdn.afuchat.com") {
    const legacyPath = url.pathname.replace(/^\/+/, "");
    const [firstSegment, ...remaining] = legacyPath.split("/");
    if (firstSegment === "cloud") {
      encodedKey = remaining.join("/");
    } else if (!["chat", "mail", "ai", "ads"].includes(firstSegment || "")) {
      encodedKey = legacyPath;
    }
  }

  if (!encodedKey) return null;
  try {
    const segments = encodedKey.split("/").map((segment) => decodeURIComponent(segment));
    if (
      segments.some((segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\/\\\u0000-\u001f\u007f]/.test(segment),
      )
    ) {
      return null;
    }
    return segments.join("/");
  } catch {
    return null;
  }
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