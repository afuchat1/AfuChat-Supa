/**
 * ─── Image Prefetcher ──────────────────────────────────────────────────────────
 *
 * Concurrency-limited background prefetch queue. Call after loading any list
 * (chats, feed, communities) so avatars and thumbnails are warm in the
 * expo-image cache before the user scrolls to them.
 *
 * Rules:
 *  • Max 4 concurrent prefetches (avoids choking the network for real requests)
 *  • Duplicate enqueues for the same URL are de-duplicated
  *  • Avatars have higher priority than thumbnails
 */

import { Image as ExpoImage } from "expo-image";
import { getNetworkProfile } from "@/lib/networkQuality";

type PrefetchItem = { url: string; type: "avatar" | "thumb" };

// Pending queue — avatars first
const _queue: PrefetchItem[] = [];
// URLs currently being downloaded or already enqueued
const _seen = new Set<string>();
// Number of active downloads
let _active = 0;
const MAX_CONCURRENT = 4;

function enqueue(item: PrefetchItem) {
  // Prefetch only on confirmed unmetered Wi-Fi. Visible images still load on
  // demand on cellular and are cached by expo-image after they are viewed.
  const network = getNetworkProfile();
  if (network.type !== "wifi" || network.connected === false || network.expensive === true) return;
  if (!item.url || !item.url.startsWith("http")) return;
  if (_seen.has(item.url)) return;
  _seen.add(item.url);
  // Avatars go to the front of the queue
  if (item.type === "avatar") {
    _queue.unshift(item);
  } else {
    _queue.push(item);
  }
  _drain();
}

function _drain() {
  while (_active < MAX_CONCURRENT && _queue.length > 0) {
    const item = _queue.shift()!;
    _active++;
    // Store prefetched assets in expo-image disk cache; it remains separate
    // from decoded bitmap memory, which the app can safely clear on background.
    ExpoImage.prefetch(item.url, "disk")
      .catch(() => {})
      .finally(() => {
        _active--;
        _drain();
      });
  }
}

/**
 * Enqueue avatar URLs for background download.
 * Call immediately after setting list state so images are ready before scroll.
 */
export function prefetchAvatars(urls: (string | null | undefined)[]): void {
  for (const url of urls) {
    if (url) enqueue({ url, type: "avatar" });
  }
}

/**
 * Enqueue thumbnail/image URLs for background download.
 */
export function prefetchThumbnails(urls: (string | null | undefined)[]): void {
  for (const url of urls) {
    if (url) enqueue({ url, type: "thumb" });
  }
}

/**
 * Convenience: prefetch both avatars and thumbnails from a list of post/item
 * objects that have common image fields.
 *
 * Supports PostItem, conversation, community item shapes.
 */
export function prefetchListImages(
  items: Record<string, any>[],
  fields: { avatarFields?: string[]; thumbFields?: string[] } = {},
): void {
  const avatarFields = fields.avatarFields ?? ["avatar_url", "author_avatar", "other_avatar"];
  const thumbFields = fields.thumbFields ?? ["image_url", "thumbnail", "cover_url"];

  const avatarUrls: string[] = [];
  const thumbUrls: string[] = [];

  for (const item of items) {
    for (const f of avatarFields) {
      if (item[f] && typeof item[f] === "string") avatarUrls.push(item[f]);
    }
    for (const f of thumbFields) {
      if (item[f] && typeof item[f] === "string") thumbUrls.push(item[f]);
    }
  }

  prefetchAvatars(avatarUrls);
  prefetchThumbnails(thumbUrls);
}
