/**
 * deepLinkHandler.ts
 *
 * Parses incoming URLs and extracts referral handles so the onboarding
 * screen can pre-fill the referral code field without any manual typing.
 *
 * Supported URL formats:
 *   https://afuchat.com/john           → referral code "JOHN"
 *   https://afuchat.com/john?ref=JOHN  → referral code "JOHN" (explicit param)
 *   afuchat://john                     → referral code "JOHN"
 *   afuchat://ref/JOHN                 → referral code "JOHN" (dedicated path)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const REFERRER_KEY = "referrer_handle";

/**
 * These path segments are NOT user handles — they are app routes.
 * Any single-segment URL that matches one of these is ignored.
 */
const SYSTEM_ROUTES = new Set([
  "wallet", "settings", "chat", "premium", "referral", "onboarding",
  "login", "register", "search", "discover", "communities", "contacts",
  "apps", "moments", "shorts", "stories", "post", "video", "article",
  "shop", "freelance", "company", "mini-programs", "prestige",
  "username-market", "match", "gifts", "events", "market", "jobs",
  "support", "qr-scanner", "digital-id", "language-settings",
  "monetize", "me", "call", "call-history", "red-envelope", "p",
  "saved-posts", "my-posts", "profile", "followers", "user-discovery",
  "linked-accounts", "device-security", "status", "contact", "group",
  "channel", "digital-events", "ref", "app", "download", "privacy",
  "terms", "about", "help", "feedback", "notifications", "likes",
  "explore", "trending", "feed", "home", "index",
]);

/** Validate that a string looks like a real user handle */
function isValidHandle(s: string): boolean {
  return /^[a-z0-9_]{2,30}$/.test(s);
}

/**
 * Parse a URL and, if it contains a referral signal, persist the referrer
 * handle (in UPPERCASE) to AsyncStorage so the onboarding screen can read it.
 *
 * Safe to call multiple times — later calls overwrite earlier ones only
 * if a referrer is actually found.
 */
export async function handleIncomingUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;

  try {
    // Normalise afuchat:// URIs so URL() can parse them
    const normalised = url.startsWith("afuchat://")
      ? url.replace("afuchat://", "https://afuchat.com/")
      : url;

    const parsed = new URL(normalised);

    // 1. Explicit ?ref=HANDLE query param — highest priority
    const refParam = parsed.searchParams.get("ref");
    if (refParam) {
      const code = refParam.trim().toUpperCase();
      if (code.length >= 2) {
        await AsyncStorage.setItem(REFERRER_KEY, code);
        return;
      }
    }

    const segments = parsed.pathname.split("/").filter(Boolean);

    // 2. Dedicated /ref/HANDLE path (e.g. afuchat://ref/JOHN)
    if (segments.length === 2 && segments[0] === "ref") {
      const handle = segments[1].toLowerCase();
      if (isValidHandle(handle)) {
        await AsyncStorage.setItem(REFERRER_KEY, handle.toUpperCase());
        return;
      }
    }

    // 3. Profile-style link: https://afuchat.com/handle
    //    Single path segment that isn't a known system route.
    if (segments.length === 1) {
      const handle = segments[0].toLowerCase();
      if (!SYSTEM_ROUTES.has(handle) && isValidHandle(handle)) {
        await AsyncStorage.setItem(REFERRER_KEY, handle.toUpperCase());
      }
    }
  } catch {
    // Malformed URL — silently ignore
  }
}

/**
 * Clear the stored referrer after it has been consumed by onboarding.
 * Call this after successfully submitting the referral, not before.
 */
export async function clearStoredReferrer(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REFERRER_KEY);
  } catch {}
}
