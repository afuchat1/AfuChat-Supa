/**
 * deepLinkHandler.ts
 *
 * Parses incoming URLs and dispatches navigation actions.
 *
 * Supported URL formats:
 *   afuchat://settings              -> open Settings screen
 *   afuchat://wallet                -> open the AfuPay wallet screen
 *   afuchat://chat/:id              -> open a specific chat
 *   afuchat://profile               -> open My Profile tab
 *   afuchat://discover              -> open Discover tab
 *   afuchat://chats                 -> open Chats tab
 *   afuchat://ai                    -> open AfuAI
 *   afuchat://premium               -> open Premium screen
 *   afuchat://join/:code            -> join a group/channel (UUID or shortId)
 *   https://afuchat.com/join/:code  -> join a group/channel (UUID or shortId)
 *   https://afuchat.com/p/:shortId  -> post detail
 *   https://afuchat.com/video/:id   -> video detail
 *   https://afuchat.com/article/:id -> article detail
 *   https://afuchat.com/channel/:id -> channel page
 *   https://afuchat.com/company/:slug -> company page
 *   https://afuchat.com/freelance/:id -> freelance listing
 *   https://afuchat.com/shop/:userId  -> user shop
 *   https://afuchat.com/stories/:userId -> story viewer
 *   https://afuchat.com/red-envelope/:id -> red envelope
 *   https://afuchat.com/id/:afuId   -> profile by AfuID
 *   https://afuchat.com/@handle     -> user profile (with @ prefix)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { decodeId } from "./shortId";

export const PENDING_JOIN_KEY = "pending_join_group_id";

export type DeepLinkAction =
  | { type: "join_group"; groupId: string; code: string }
  | { type: "navigate"; path: string; params?: Record<string, string> }
  | null;

/**
 * Android may deliver the same custom-scheme link as either
 * afuchat://chat/id (host + path) or afuchat:///chat/id (path only).
 * The boot handoff uses this helper to pause its normal redirect while the
 * root deep-link gate resolves the destination.
 */
export function isAfuChatDeepLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const isAfuHost =
      parsed.protocol === "afuchat:" ||
      parsed.hostname === "afuchat.com" ||
      parsed.hostname === "www.afuchat.com";
    if (!isAfuHost) return false;
    if (parsed.protocol === "afuchat:") {
      return parsed.hostname.length > 0 || parsed.pathname.length > 1;
    }
    return parsed.pathname !== "/" && parsed.pathname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Direct navigation routes — single-segment afuchat:// paths that map to
 * app screens. Checked before catch-all profile handling so system paths are never
 * misidentified as user handles.
 */
const NAV_ROUTES: Record<string, string> = {
  // ── Tab screens ────────────────────────────────────────────────────────────
  discover:           "/(tabs)/discover",
  chats:              "/(tabs)/chats",
  chat:               "/(tabs)/chats",
  search:             "/(tabs)/search",
  "new-chat":         "/chat/new",
  communities:        "/(tabs)/communities",
  contacts:           "/(tabs)/contacts",
  apps:               "/apps",
  shorts:             "/(tabs)/shorts",
  // ── Profile ────────────────────────────────────────────────────────────────
  profile:            "/(tabs)/me",
  me:                 "/(tabs)/me",
  followers:          "/followers",
  // ── Core screens ──────────────────────────────────────────────────────────
  settings:           "/settings",
  wallet:             "/app/afupay",
  ai:                 "/ai",
  premium:            "/premium",
  prestige:           "/prestige",
  store:              "/app/afumarket",
  support:            "/support",
  about:              "/about",
  terms:              "/terms",
  help:               "/help",
  privacy:            "/privacy",
  // ── Content creation ──────────────────────────────────────────────────────
  moments:            "/moments",
  "create-post":      "/create-post",
  stories:            "/stories/view",
  // ── Social ────────────────────────────────────────────────────────────────
  achievements:       "/achievements",
  collections:        "/app/afucollections",
  "saved-posts":      "/app/afusaved",
  "my-posts":         "/my-posts",
  "watch-history":    "/watch-history",
  // ── Commerce & mini-apps ──────────────────────────────────────────────────
  shop:               "/shop",
  games:              "/app/afugames",
  freelance:          "/app/afufreelance",
  gifts:              "/app/afugifts",
  business:           "/app/afubusiness",
};

/**
 * These path segments are NOT user handles — they are app routes.
 * Any single-segment URL that matches one of these is not treated as a user handle.
 */
const SYSTEM_ROUTES = new Set([
  ...Object.keys(NAV_ROUTES),
  "wallet", "settings", "chat", "premium", "onboarding",
  "login", "register", "search", "discover", "communities", "contacts",
  "apps", "moments", "shorts", "stories", "post", "video", "article",
  "shop", "freelance", "company", "mini-programs", "prestige",
  "username-market", "match", "gifts", "events", "market", "jobs",
  "support", "qr-scanner", "digital-id", "language-settings",
  "me", "call", "red-envelope", "p",
  "saved-posts", "my-posts", "profile", "followers", "user-discovery",
  "device-security", "status", "contact", "group",
  "channel", "digital-events", "ref", "app", "download", "privacy",
  "terms", "about", "help", "feedback", "likes",
  "explore", "trending", "feed", "home", "index", "join",
  "achievements", "watch-history",
  "business", "collections", "games", "welcome",
  "store", "paid-communities", "phone-contacts", "file-manager",
  "create-post", "username-market", "user-discovery",
  "profile-not-found", "profile-private",
  "id", "report", "register", "reset-password", "chat-info",
]);

/** Validate that a string looks like a real user handle */
function isValidHandle(s: string): boolean {
  return /^[a-z0-9_]{2,30}$/.test(s);
}

/** Validate a UUID v4 */
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Validate a base-62 shortId code (10-25 alphanumeric chars) */
function isShortCode(s: string): boolean {
  return s.length >= 10 && s.length <= 25 && /^[0-9A-Za-z]+$/.test(s);
}

/**
 * Chat IDs are UUIDs today, but native launchers can preserve another
 * database-safe identifier format. Keep the route parser in sync with the
 * native shortcut payload instead of silently dropping a valid target.
 */
function isChatId(s: string): boolean {
  return isUUID(s) || /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(s);
}

function decodePathSegment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Parse a URL and return a DeepLinkAction if one is identified, or null.
 *
 * Priority order:
 *  1. /join/:code  — group/channel invite
 *  2. /chat/:id    — direct chat open (two-segment)
 *  3. Navigation routes (afuchat://settings, etc.)
 *  4. /:handle  — profile navigation
 *
 * Side-effects:
 *  - Persists pending group-join codes to AsyncStorage (PENDING_JOIN_KEY).
 */
export async function handleIncomingUrl(url: string | null | undefined): Promise<DeepLinkAction> {
  if (!url) return null;

  try {
    const isCustomScheme = url.startsWith("afuchat://");
    const parsed = new URL(
      isCustomScheme ? url.replace("afuchat://", "https://afuchat.com/") : url,
    );
    const segments = parsed.pathname.split("/").filter(Boolean);

    // 1. /join/:code -- group/channel invite link (UUID or shortId)
    if (segments.length === 2 && segments[0] === "join") {
      const code = segments[1];
      let groupId: string | null = null;

      if (isUUID(code)) {
        groupId = code;
      } else if (isShortCode(code)) {
        try {
          const decoded = decodeId(code);
          if (isUUID(decoded)) groupId = decoded;
        } catch {}
      }

      if (groupId) {
        await AsyncStorage.setItem(PENDING_JOIN_KEY, code);
        return { type: "join_group", groupId, code };
      }
    }

    // 2. /chat/:id -- open a specific conversation
    if (segments.length === 2 && segments[0] === "chat") {
      const chatId = decodePathSegment(segments[1]);
      if (isChatId(chatId)) {
        return { type: "navigate", path: "/chat/[id]", params: { id: chatId } };
      }
    }

    // 2a. Android Direct Share target. The share payload is still delivered
    // through expo-share-intent; this URL only tells the share screen which
    // existing conversation should receive it.
    if (segments.length === 1 && segments[0] === "share-chat") {
      const chatId = parsed.searchParams.get("chatId");
      const decodedChatId = chatId ? decodePathSegment(chatId) : "";
      if (decodedChatId && isChatId(decodedChatId)) {
        return { type: "navigate", path: "/share", params: { chatId: decodedChatId } };
      }
    }

    // 2b. /p/:shortId -- post detail (base-62 encoded UUID)
    if (segments.length === 2 && segments[0] === "p") {
      const code = segments[1];
      let postId: string | null = null;
      if (isUUID(code)) {
        postId = code;
      } else if (isShortCode(code)) {
        try { const d = decodeId(code); if (isUUID(d)) postId = d; } catch {}
      }
      if (postId) return { type: "navigate", path: "/post/[id]", params: { id: postId } };
    }

    // 2c. /video/:id -- video detail (UUID or base-62 shortId)
    if (segments.length === 2 && segments[0] === "video") {
      const code = segments[1];
      let videoId: string | null = null;
      if (isUUID(code)) {
        videoId = code;
      } else if (isShortCode(code)) {
        try { const d = decodeId(code); if (isUUID(d)) videoId = d; } catch {}
      }
      if (videoId) return { type: "navigate", path: "/video/[id]", params: { id: videoId } };
    }

    // 2d. /article/:id -- article detail
    if (segments.length === 2 && segments[0] === "article") {
      const articleId = segments[1];
      let resolvedId: string | null = null;
      if (isUUID(articleId)) {
        resolvedId = articleId;
      } else if (isShortCode(articleId)) {
        try { const d = decodeId(articleId); if (isUUID(d)) resolvedId = d; } catch {}
      }
      if (resolvedId) return { type: "navigate", path: "/article/[id]", params: { id: resolvedId } };
    }

    // 2e. /channel/:id -- legacy channel link; the route bridges into chat
    if (segments.length === 2 && segments[0] === "channel" && isUUID(segments[1])) {
      return { type: "navigate", path: "/channel/[id]", params: { id: segments[1] } };
    }

    // 2f. /group/:id -- group page
    if (segments.length === 2 && segments[0] === "group" && isUUID(segments[1])) {
      return { type: "navigate", path: "/group/[id]", params: { id: segments[1] } };
    }

    // 2g. /company/:slug -- company page
    if (segments.length === 2 && segments[0] === "company" && segments[1]) {
      return { type: "navigate", path: "/company/[slug]", params: { slug: segments[1] } };
    }

    // 2h. /freelance/:id -- freelance listing
    if (segments.length === 2 && segments[0] === "freelance" && isUUID(segments[1])) {
      return { type: "navigate", path: "/app/afufreelance", params: { section: "detail", id: segments[1] } };
    }

    // 2i. /shop/:userId -- user shop
    if (segments.length === 2 && segments[0] === "shop" && isUUID(segments[1])) {
      return { type: "navigate", path: "/app/afumarket", params: { section: "storefront", userId: segments[1] } };
    }

    // 2j. /stories/:userId -- story viewer
    if (segments.length === 2 && segments[0] === "stories") {
      const code = segments[1];
      let userId: string | null = null;
      if (isUUID(code)) {
        userId = code;
      } else if (isShortCode(code)) {
        try { const d = decodeId(code); if (isUUID(d)) userId = d; } catch {}
      }
      if (userId) return { type: "navigate", path: "/stories/view", params: { userId } };
    }

    // 2k. /red-envelope/:id -- red envelope claim
    if (segments.length === 2 && segments[0] === "red-envelope") {
      const code = segments[1];
      let envelopeId: string | null = null;
      if (isUUID(code)) {
        envelopeId = code;
      } else if (isShortCode(code)) {
        try { const d = decodeId(code); if (isUUID(d)) envelopeId = d; } catch {}
      }
      if (envelopeId) return { type: "navigate", path: "/red-envelope/[id]", params: { id: envelopeId } };
    }

    // 2l. /id/:afuId -- profile by AfuID number
    if (segments.length === 2 && segments[0] === "id" && segments[1]) {
      return { type: "navigate", path: "/id/[afuId]", params: { afuId: segments[1] } };
    }

    // 2m. /@handle -- profile URL with @ prefix (e.g. afuchat.com/@johndoe)
    if (segments.length === 1 && segments[0].startsWith("@")) {
      const handle = segments[0].slice(1).toLowerCase();
      if (isValidHandle(handle)) {
    // Treat as a profile navigation
        return { type: "navigate", path: "/[handle]", params: { handle } };
      }
    }

    // 3. Single-segment navigation routes (afuchat://settings, afuchat://wallet, etc.)
    if (segments.length === 1) {
      const seg = segments[0].toLowerCase();
      const navPath = NAV_ROUTES[seg];
      if (navPath) {
        return { type: "navigate", path: navPath };
      }
    }

    // 4. Profile-style link: https://afuchat.com/handle
    if (segments.length === 1) {
      const handle = segments[0].toLowerCase();
      if (!SYSTEM_ROUTES.has(handle) && isValidHandle(handle)) {
        return { type: "navigate", path: "/[handle]", params: { handle } };
      }
    }
  } catch {
    // Malformed URL -- silently ignore
  }

  return null;
}

/** Consume a pending group-join code -- returns it and clears the storage entry */
export async function consumePendingJoin(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(PENDING_JOIN_KEY);
    if (code) await AsyncStorage.removeItem(PENDING_JOIN_KEY);
    return code;
  } catch {
    return null;
  }
}

// End of deep-link handling.

