import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage, KEYS } from "./storage/mmkv";

const FEED_CACHE_TTL_MS = 30 * 60 * 1000;

const CACHE_KEYS = {
  PROFILE: "offline_profile",
  CONVERSATIONS: "offline_conversations",
  CONTACTS: "offline_contacts",
  MESSAGES_PREFIX: "offline_messages_",
  MOMENTS: "offline_moments",
  PENDING_MESSAGES: "offline_pending_messages",
  FEED_FOR_YOU: "feed_tab_cache_for_you_v3",
  FEED_FOLLOWING: "feed_tab_cache_following_v3",
  FEED_CURSOR_FOR_YOU: "feed_cursor_for_you_v3",
  FEED_CURSOR_FOLLOWING: "feed_cursor_following_v3",
  WALLET: "offline_wallet",
  SHORTS_FOR_YOU: "shorts_feed_cache_for_you_v1",
  SHORTS_FOLLOWING: "shorts_feed_cache_following_v1",
};

export type PendingMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string;
  created_at: string;
};

// NetInfo is asynchronous on native, and release builds can mount the first
// screen before its initial fetch resolves. Treating that unknown window as
// offline makes connected users take the cache-only branch and can leave the
// app looking offline until the next network transition. Screens already
// hydrate local caches first, so allow network work during the short unknown
// window; once NetInfo reports, the real state takes over immediately.
let _isOnline = true;
let _listeners: ((online: boolean) => void)[] = [];
// Reconnect-specific listeners — fired ONLY when transitioning from offline → online.
// Use onReconnect() to subscribe; screens use this to trigger a data refresh
// without having to filter out the offline→online direction themselves.
let _reconnectListeners: (() => void)[] = [];
let _netInfoInitialized = false;
let _netInfoReported = false;

function _fireConnectivity(newOnline: boolean): void {
  const wasOnline = _isOnline;
  const hadInitialReport = _netInfoReported;
  _netInfoReported = true;
  _isOnline = newOnline;
  _listeners.forEach((fn) => { try { fn(newOnline); } catch {} });
  // Do not classify the first NetInfo answer as a reconnect. Auth bootstrap
  // already owns the initial fetch; reconnect listeners are for a real
  // offline -> online transition after the device has reported once.
  if (newOnline && hadInitialReport && !wasOnline) {
    _reconnectListeners.forEach((fn) => { try { fn(); } catch {} });
  }
}

function initNetInfo() {
  if (_netInfoInitialized) return;
  _netInfoInitialized = true;

  try {
    const NetInfo = require("@react-native-community/netinfo").default;

    // Fetch initial connectivity state immediately (async) so the very first
    // call to isOnline() after boot reflects reality rather than the optimistic
    // "true" default. This matters on cold start when the phone is offline.
    NetInfo.fetch().then((state: any) => {
      // Android's internet-reachability probe is frequently stale or blocked
      // by carrier DNS/captive-portal checks even while normal HTTPS requests
      // work. Use the transport connection as the offline signal; request
      // failures still fall back to the local cache without misclassifying a
      // connected user as offline.
      const initialOnline = state.isConnected !== false;
      // Always publish the first result, including an online result. This
      // makes the initial unknown -> online transition available to reconnect
      // listeners that mounted during auth restoration.
      if (initialOnline !== _isOnline || !_netInfoReported) _fireConnectivity(initialOnline);
    }).catch(() => {});

    NetInfo.addEventListener((state: any) => {
      const newOnline = state.isConnected !== false;
      if (newOnline !== _isOnline || !_netInfoReported) _fireConnectivity(newOnline);
    });
  } catch {}
}

export function isOnline(): boolean {
  // Start the connectivity bridge on first use instead of during module
  // evaluation. This keeps importing the offline cache safe and cheap during
  // auth/navigation startup while preserving a cache-first render.
  initNetInfo();
  // Unknown connectivity must not make a connected release build look offline.
  // NetInfo will correct this as soon as its first native result arrives.
  return _netInfoReported ? _isOnline : true;
}

export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  initNetInfo();
  _listeners.push(fn);
  // NetInfo may finish its initial fetch before a screen's effect subscribes
  // (more common in release builds, where module evaluation is faster). Replay
  // the known state once so screens do not remain on their offline/cache path
  // until the next physical network transition.
  if (_netInfoReported) {
    setTimeout(() => {
      if (_listeners.includes(fn)) {
        try { fn(_isOnline); } catch {}
      }
    }, 0);
  }
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

/**
 * Subscribe to the offline → online reconnect event.
 *
 * The callback fires once each time the device regains internet access.
 * Use it to trigger a background data refresh (conversations, messages, etc.)
 * without having to implement connectivity direction detection in every screen.
 *
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 *
 * Example:
 *   useEffect(() => onReconnect(() => fetchLatestMessages()), []);
 */
export function onReconnect(fn: () => void): () => void {
  initNetInfo();
  _reconnectListeners.push(fn);
  return () => {
    _reconnectListeners = _reconnectListeners.filter((l) => l !== fn);
  };
}

export async function cacheProfile(profile: any): Promise<void> {
  try {
    // Write to MMKV synchronously (fast, survives restarts) AND AsyncStorage (compat)
    storage.setObject(KEYS.USER_PROFILE, profile);
    await AsyncStorage.setItem(CACHE_KEYS.PROFILE, JSON.stringify(profile));
  } catch {}
}

export async function getCachedProfile(): Promise<any | null> {
  try {
    // MMKV is synchronous — read it first (zero I/O). Fall back to AsyncStorage.
    const fast = storage.getObject<any>(KEYS.USER_PROFILE);
    if (fast) return fast;
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Synchronous (no await needed) — MMKV only, no I/O. Used for instant startup. */
export function getCachedProfileSync(): any | null {
  return storage.getObject<any>(KEYS.USER_PROFILE) ?? null;
}

export async function cacheConversations(conversations: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
  } catch {}
}

export async function getCachedConversations(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.CONVERSATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheMessages(chatId: string, messages: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.MESSAGES_PREFIX + chatId, JSON.stringify(messages));
  } catch {}
}

export async function getCachedMessages(chatId: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.MESSAGES_PREFIX + chatId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheContacts(contacts: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.CONTACTS, JSON.stringify(contacts));
  } catch {}
}

export async function getCachedContacts(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.CONTACTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheMoments(moments: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.MOMENTS, JSON.stringify(moments));
  } catch {}
}

export async function getCachedMoments(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.MOMENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function queueMessage(msg: PendingMessage): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    const pending: PendingMessage[] = raw ? JSON.parse(raw) : [];
    pending.push(msg);
    await AsyncStorage.setItem(CACHE_KEYS.PENDING_MESSAGES, JSON.stringify(pending));
  } catch {}
}

export async function getPendingMessages(): Promise<PendingMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearPendingMessages(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEYS.PENDING_MESSAGES);
  } catch {}
}

export async function removePendingMessage(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    const pending: PendingMessage[] = raw ? JSON.parse(raw) : [];
    const filtered = pending.filter((m) => m.id !== id);
    await AsyncStorage.setItem(CACHE_KEYS.PENDING_MESSAGES, JSON.stringify(filtered));
  } catch {}
}

export async function cacheWallet(data: { acoin: number; transactions: any[] }): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.WALLET, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch {}
}

export async function getCachedWallet(): Promise<{ acoin: number; transactions: any[]; cachedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.WALLET);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheShortsTab(tab: "for_you" | "following", posts: any[]): Promise<void> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.SHORTS_FOR_YOU : CACHE_KEYS.SHORTS_FOLLOWING;
    await AsyncStorage.setItem(key, JSON.stringify({ posts, cachedAt: Date.now() }));
  } catch {}
}

export async function getCachedShortsTab(tab: "for_you" | "following"): Promise<{ posts: any[]; cachedAt: number } | null> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.SHORTS_FOR_YOU : CACHE_KEYS.SHORTS_FOLLOWING;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.posts?.length) return null;
    return { posts: parsed.posts, cachedAt: parsed.cachedAt || 0 };
  } catch {
    return null;
  }
}

export async function cacheFeedTab(tab: "for_you" | "following", posts: any[]): Promise<void> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.FEED_FOR_YOU : CACHE_KEYS.FEED_FOLLOWING;
    await AsyncStorage.setItem(key, JSON.stringify({ posts, cachedAt: Date.now() }));
  } catch {}
}

export async function getCachedFeedTab(tab: "for_you" | "following"): Promise<{ posts: any[]; cachedAt: number; isStale: boolean } | null> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.FEED_FOR_YOU : CACHE_KEYS.FEED_FOLLOWING;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.posts?.length) return null;
    const isStale = Date.now() - (parsed.cachedAt || 0) > FEED_CACHE_TTL_MS;
    return { posts: parsed.posts, cachedAt: parsed.cachedAt || 0, isStale };
  } catch {
    return null;
  }
}

export async function cacheFeedCursor(tab: "for_you" | "following", oldestCreatedAt: string): Promise<void> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.FEED_CURSOR_FOR_YOU : CACHE_KEYS.FEED_CURSOR_FOLLOWING;
    await AsyncStorage.setItem(key, oldestCreatedAt);
  } catch {}
}

export async function getFeedCursor(tab: "for_you" | "following"): Promise<string | null> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.FEED_CURSOR_FOR_YOU : CACHE_KEYS.FEED_CURSOR_FOLLOWING;
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

// ─── Cached user identity ──────────────────────────────────────────────────────
// PRIMARY:  MMKV (synchronous, instant reads — used for fast startup path).
// BACKUP:   AsyncStorage key "@ac:uid_bk" — written alongside every MMKV write.
//           If MMKV falls back to an in-memory store (e.g. JNI init failure in
//           production), the AsyncStorage backup is the only durable copy.
//           Call initUserIdCache() early at startup to pre-populate the
//           synchronous MMKV / in-memory mirror from the AsyncStorage backup.
// MIRROR:   _uidMirror — module-level variable that reflects the current
//           session's user ID even when both MMKV and AsyncStorage have not yet
//           been read (used only as an in-session last resort).

const LAST_USER_KEY = "last_authed_user_id";
const UID_BACKUP_KEY = "@ac:uid_bk"; // AsyncStorage key for the durable backup

// In-session in-memory mirror. Populated from MMKV on first read and from
// the AsyncStorage backup by initUserIdCache(). Never survives a process kill.
let _uidMirror: string | null = null;

/**
 * Pre-populate the synchronous user-ID cache from the AsyncStorage backup.
 * Call this once, as early as possible in the app startup (before AuthProvider
 * mounts), so getCachedUserId() can return the correct value synchronously even
 * when MMKV is using an in-memory fallback store.
 *
 * Safe to call multiple times — exits immediately if the cache is already warm.
 */
export async function initUserIdCache(): Promise<void> {
  // Already warm — nothing to do.
  if (_uidMirror) return;
  try {
    const mmkvVal = storage.getString(LAST_USER_KEY);
    if (mmkvVal) { _uidMirror = mmkvVal; return; }
  } catch {}
  // MMKV miss (memory-store fallback) — restore from AsyncStorage backup.
  try {
    const backup = await AsyncStorage.getItem(UID_BACKUP_KEY);
    if (backup) {
      _uidMirror = backup;
      // Promote back to MMKV so future synchronous reads work within this session.
      try { storage.setString(LAST_USER_KEY, backup); } catch {}
    }
  } catch {}
}

/** Persist the authenticated user's ID synchronously. Call whenever user changes. */
export function setCachedUserId(userId: string): void {
  _uidMirror = userId;
  try { storage.setString(LAST_USER_KEY, userId); } catch {}
  // Async backup — survives a MMKV memory-store fallback across cold restarts.
  AsyncStorage.setItem(UID_BACKUP_KEY, userId).catch(() => {});
}

/** Read the last authenticated user's ID instantly (no I/O). */
export function getCachedUserId(): string | null {
  try {
    const v = storage.getString(LAST_USER_KEY);
    if (v) { _uidMirror = v; return v; }
  } catch {}
  // MMKV miss — return the in-session mirror (populated by setCachedUserId or
  // by initUserIdCache() running asynchronously at startup).
  return _uidMirror;
}

/** Erase the cached user ID on explicit sign-out. */
export function clearCachedUserId(): void {
  _uidMirror = null;
  try { storage.delete(LAST_USER_KEY); } catch {}
  AsyncStorage.removeItem(UID_BACKUP_KEY).catch(() => {});
}

/**
 * Wipes every byte of user-specific local data so that switching accounts
 * never leaks one account's data into another.
 *
 * Call this BEFORE setting the new Supabase session.
 *
 * Covers:
 *  - MMKV profile, feed cursors, wallet, search history, etc.
 *  - AsyncStorage: profile, conversations, messages, feed caches, search,
 *    feed algorithm weights, media upload usage, feature usage counters,
 *    wallet, suggested-users dismiss list, pending messages.
 */
export async function clearAccountCache(): Promise<void> {
  try {
    await import("./storage/localConversations")
      .then(({ invalidateConversationWrites }) => invalidateConversationWrites())
      .catch(() => {});

    // ── MMKV (synchronous, zero I/O) ──────────────────────────────────────────
    storage.delete(KEYS.USER_PROFILE);
    storage.delete(KEYS.USER_ID);
    storage.delete(LAST_USER_KEY);
    storage.delete(KEYS.FEED_CURSOR_FOR_YOU);
    storage.delete(KEYS.FEED_CURSOR_FOLLOWING);
    storage.delete(KEYS.FEED_SCROLL_OFFSET);
    storage.delete(KEYS.VIEWED_POST_IDS);
    storage.delete(KEYS.WALLET_BALANCE);
    storage.delete(KEYS.WALLET_CACHED_AT);
    storage.delete(KEYS.SEARCH_HISTORY);
    storage.delete(KEYS.INTERESTS);

    // ── SQLite — per-account permanent data ───────────────────────────────────
    // Chat folders and video progress are user-specific and must be cleared on
    // account switch so they never leak from one account to another.
    // (Messages, conversations, contacts, feed, settings are cleared separately
    //  by their own delete* helpers or are the new user's data anyway.)
    await Promise.all([
      import("./storage/chatFolders")
        .then(({ clearAllFolders }) => clearAllFolders())
        .catch(() => {}),
      import("./videoProgress")
        .then(({ clearAllVideoProgress }) => clearAllVideoProgress())
        .catch(() => {}),
      // The queue has no authenticated owner column in older databases.
      // Clear it during account transitions rather than risk replaying an
      // old account's actions under a new session.
      import("./storage/db")
        .then(async ({ getDB }) => {
          const db = await getDB();
          await db.runAsync("DELETE FROM offline_queue");
        })
        .catch(() => {}),
    ]);

    // ── AsyncStorage (async batch) ────────────────────────────────────────────
    const allKeys = await AsyncStorage.getAllKeys();

    // Per-chat message caches  →  "offline_messages_<chatId>"
    const messageCacheKeys = allKeys.filter((k) =>
      k.startsWith(CACHE_KEYS.MESSAGES_PREFIX)
    );

    // Daily feature-usage counters  →  "afuchat_feature_<name>_<YYYY-MM-DD>"
    const featureUsageKeys = allKeys.filter((k) =>
      k.startsWith("afuchat_feature_")
    );

    await AsyncStorage.multiRemove([
      // Core offline caches (legacy AsyncStorage — SQLite is now the source of truth)
      CACHE_KEYS.PROFILE,
      CACHE_KEYS.CONVERSATIONS,
      CACHE_KEYS.CONTACTS,
      CACHE_KEYS.MOMENTS,
      CACHE_KEYS.PENDING_MESSAGES,
      CACHE_KEYS.WALLET,
      // Feed caches
      CACHE_KEYS.FEED_FOR_YOU,
      CACHE_KEYS.FEED_FOLLOWING,
      CACHE_KEYS.FEED_CURSOR_FOR_YOU,
      CACHE_KEYS.FEED_CURSOR_FOLLOWING,
      // Search (account-personal history + saved searches + pinned results)
      "@afuchat_search_history",
      "@afuchat_saved_searches",
      "@afuchat_pinned_results",
      // Feed algorithm personalisation weights
      "feed_interaction_weights_v1",
      // Media upload quota cache
      "@afuchat:storage_usage_v1",
      // UI preferences that are per-account
      "suggested_users_dismissed_v1",
      // Legacy chat folders key (already migrated to SQLite on v13 upgrade)
      "chat_folders_v1",
      ...messageCacheKeys,
      ...featureUsageKeys,
    ]);
  } catch {}
}

// ─── Device-level preference keys ────────────────────────────────────────────
// These belong to the device / install, not to any logged-in account.
// They survive sign-out and account wipes so users never have to reconfigure
// theme, language, and sound preferences after signing out.
// (Same behaviour as WhatsApp, Telegram, YouTube.)

/** MMKV keys that must survive wipeAllLocalData. */
const DEVICE_MMKV_KEYS: string[] = [
  KEYS.THEME_MODE,        // "theme_mode"    — dark/light/system toggle
  KEYS.ACCENT_COLOR,      // "accent_color"  — brand accent
  KEYS.LANGUAGE,          // "app_language"  — UI language
  KEYS.ONBOARDING_DONE,   // "onboarding_done" — never show welcome slides again
  KEYS.APP_LOCK_ENABLED,  // "app_lock_enabled" — biometric/PIN lock preference
  KEYS.DATA_MODE_OVERRIDE, // "data_mode_override" — data-saver toggle
];

/** AsyncStorage keys that must survive wipeAllLocalData. */
const DEVICE_ASYNC_KEYS: string[] = [
  "@afuchat_theme",    // ThemeContext — persisted theme choice
];

/**
 * Nuclear wipe — clears every byte of local user data.
 *
 * Used on explicit sign-out so the device looks exactly like a fresh install.
 * Covers ALL stores: MMKV, AsyncStorage, and every SQLite table.
 *
 * Device-level preferences (theme, language, and sound) are
 * preserved across the wipe — they belong to the install, not the account.
 *
 * Safe to call even if individual stores fail — each store is wrapped
 * in its own try/catch so one failure never blocks the others.
 */
let wipeInFlight: Promise<void> | null = null;

export function waitForLocalDataWipe(): Promise<void> {
  return wipeInFlight ?? Promise.resolve();
}

export function wipeAllLocalData(): Promise<void> {
  if (wipeInFlight) return wipeInFlight;
  wipeInFlight = performWipeAllLocalData().finally(() => {
    wipeInFlight = null;
  });
  return wipeInFlight;
}

async function performWipeAllLocalData(): Promise<void> {
  await import("./storage/localConversations")
    .then(({ invalidateConversationWrites }) => invalidateConversationWrites())
    .catch(() => {});

  // ── 1. MMKV: snapshot device prefs → clearAll → restore ───────────────────
  try {
    // Build the full list of keys to preserve:
    //   • DEVICE_MMKV_KEYS: explicit device-level preferences (theme, sound, etc.)
    //   • Any key starting with "perm_status_": permission cache entries.
    //     Permissions belong to the OS / device installation, NOT the user account.
    //     Wiping them would cause redundant permission prompts after every sign-out.
    const permKeys = storage.getAllKeys().filter((k) => k.startsWith("perm_status_"));
    const keysToPreserve = [...DEVICE_MMKV_KEYS, ...permKeys];

    const mmkvSnapshot: Array<{ key: string; type: "string" | "number" | "boolean"; value: string | number | boolean }> = [];
    for (const key of keysToPreserve) {
      const str = storage.getString(key);
      if (str !== undefined) { mmkvSnapshot.push({ key, type: "string", value: str }); continue; }
      const num = storage.getNumber(key);
      if (num !== undefined) { mmkvSnapshot.push({ key, type: "number", value: num }); continue; }
      const bool = storage.getBoolean(key);
      if (bool !== undefined) { mmkvSnapshot.push({ key, type: "boolean", value: bool }); }
    }

    storage.clearAll();

    // Restore device preferences + permission cache immediately after the clear
    for (const { key, type, value } of mmkvSnapshot) {
      try {
        if (type === "string")  storage.setString(key, value as string);
        else if (type === "number")  storage.setNumber(key, value as number);
        else if (type === "boolean") storage.setBoolean(key, value as boolean);
      } catch {}
    }
  } catch {}

  // ── 2. AsyncStorage: snapshot device prefs → clear → restore ──────────────
  try {
    // Also clear the UID backup so a wiped-account cannot be restored from it.
    _uidMirror = null;

    // Save device preferences before the full AsyncStorage clear
    const asyncPairs: Array<[string, string]> = [];
    for (const key of DEVICE_ASYNC_KEYS) {
      try {
        const val = await AsyncStorage.getItem(key);
        if (val !== null) asyncPairs.push([key, val]);
      } catch {}
    }

    await AsyncStorage.clear();

    // Restore device preferences
    if (asyncPairs.length > 0) {
      await AsyncStorage.multiSet(asyncPairs).catch(() => {});
    }
  } catch {}

  // ── 3. SQLite: wipe every user-data table ──────────────────────────────────
  try {
    const { getDB } = await import("./storage/db");
    const db = await getDB();
    const tables = [
      "conversations", "messages", "feed_posts",
      "search_history", "media_cache", "offline_queue", "contacts",
      "video_registry", "phone_contact_names", "chat_folders",
      "user_profiles", "user_settings", "call_history",
    ];
    for (const t of tables) {
      try { await db.runAsync(`DELETE FROM ${t}`); } catch {}
    }
  } catch {}
}
