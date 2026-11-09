// ─── MMKV wrapper ──────────────────────────────────────────────────────────────
// Native (Android/iOS): uses react-native-mmkv (JSI, synchronous).
// Web:      uses localStorage so data persists across page refreshes.
// Expo Go:  in-memory store (MMKV module is not available in Expo Go).

type MMKVLike = {
  set(key: string, value: string | number | boolean): void;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
  clearAll(): void;
};

function createMemoryStore(): MMKVLike {
  const mem = new Map<string, string | number | boolean>();
  return {
    set(key, value) { mem.set(key, value); },
    getString(key) { const v = mem.get(key); return typeof v === "string" ? v : undefined; },
    getNumber(key) { const v = mem.get(key); return typeof v === "number" ? v : undefined; },
    getBoolean(key) { const v = mem.get(key); return typeof v === "boolean" ? v : undefined; },
    delete(key) { mem.delete(key); },
    contains(key) { return mem.has(key); },
    getAllKeys() { return Array.from(mem.keys()); },
    clearAll() { mem.clear(); },
  };
}

/**
 * Web-persistent store backed by localStorage.
 * Prefixes every key with "mmkv_" to avoid collisions with other libraries.
 * Survives page refreshes so session/profile data is not lost on web restarts.
 */
function createLocalStorageStore(): MMKVLike {
  const PREFIX = "mmkv_";
  function _raw(key: string): string | null {
    try { return localStorage.getItem(PREFIX + key); } catch { return null; }
  }
  function _parse(raw: string | null): string | number | boolean | undefined {
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return {
    set(key, value)   { try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {} },
    getString(key)    { const v = _parse(_raw(key)); return typeof v === "string"  ? v : undefined; },
    getNumber(key)    { const v = _parse(_raw(key)); return typeof v === "number"  ? v : undefined; },
    getBoolean(key)   { const v = _parse(_raw(key)); return typeof v === "boolean" ? v : undefined; },
    delete(key)       { try { localStorage.removeItem(PREFIX + key); } catch {} },
    contains(key)     { try { return localStorage.getItem(PREFIX + key) !== null; } catch { return false; } },
    getAllKeys()       { try { return Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length)); } catch { return []; } },
    clearAll()        { try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch {} },
  };
}

let _store: MMKVLike | null = null;

/**
 * Returns true when running inside Expo Go.
 * react-native-mmkv is NOT bundled in Expo Go — requiring it would throw.
 */
function isExpoGo(): boolean {
  try {
    const Constants = require("expo-constants").default;
    if (
      Constants?.appOwnership === "expo" ||
      Constants?.executionEnvironment === "storeClient"
    ) {
      return true;
    }
  } catch {}

  try {
    const { NativeModules } = require("react-native");
    if (NativeModules?.ExponentConstants?.appOwnership === "expo") return true;
  } catch {}

  // NOTE: do NOT check `typeof global.__expo !== "undefined"` here.
  // The __expo global is injected by the Expo SDK runtime in ALL Expo apps —
  // including production standalone builds — so that check is a false positive
  // that causes production apps to silently fall back to the in-memory store
  // and lose all data on every restart.

  return false;
}

function getStore(): MMKVLike {
  if (_store) return _store;

  // Web: use localStorage for durable persistence across page refreshes.
  try {
    const { Platform } = require("react-native");
    if (Platform.OS === "web") {
      _store = typeof localStorage !== "undefined"
        ? createLocalStorageStore()
        : createMemoryStore();
      return _store;
    }
  } catch {}

  // Expo Go: MMKV JSI module is absent — fall back to in-memory.
  if (isExpoGo()) {
    _store = createMemoryStore();
    return _store;
  }

  // Native production build: use real MMKV for durable persistence.
  // Try twice (in case of a transient JNI init race on some devices).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { MMKV } = require("react-native-mmkv") as any;
      _store = new MMKV({ id: "afuchat-store" });
      return _store!;
    } catch (err) {
      if (attempt === 0) continue; // retry once
      // Both attempts failed: log prominently so the crash reporter captures it.
      // Fall back to memory store so the app at least opens.
      if (typeof console !== "undefined") {
        console.error("[MMKV] Failed to initialise persistent store — falling back to in-memory. All data will be lost on restart.", err);
      }
    }
  }

  _store = createMemoryStore();
  return _store!;
}

// ─── Typed helpers ─────────────────────────────────────────────────────────────

export const storage = {
  setString(key: string, value: string) { getStore().set(key, value); },
  getString(key: string): string | undefined { return getStore().getString(key); },

  setNumber(key: string, value: number) { getStore().set(key, value); },
  getNumber(key: string): number | undefined { return getStore().getNumber(key); },

  setBoolean(key: string, value: boolean) { getStore().set(key, value); },
  getBoolean(key: string): boolean | undefined { return getStore().getBoolean(key); },

  setObject<T>(key: string, value: T) {
    getStore().set(key, JSON.stringify(value));
  },
  getObject<T>(key: string): T | undefined {
    const raw = getStore().getString(key);
    if (!raw) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
  },

  delete(key: string) { getStore().delete(key); },
  contains(key: string): boolean { return getStore().contains(key); },
  getAllKeys(): string[] { return getStore().getAllKeys(); },
  clearAll() { getStore().clearAll(); },

  setWithTTL<T>(key: string, value: T, ttlMs: number) {
    getStore().set(key, JSON.stringify({ v: value, exp: Date.now() + ttlMs }));
  },
  getWithTTL<T>(key: string): T | undefined {
    const raw = getStore().getString(key);
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as { v: T; exp: number };
      if (Date.now() > parsed.exp) { getStore().delete(key); return undefined; }
      return parsed.v;
    } catch { return undefined; }
  },
};

// ─── Storage keys ──────────────────────────────────────────────────────────────
export const KEYS = {
  USER_PROFILE: "user_profile",
  USER_ID: "user_id",
  THEME_MODE: "theme_mode",
  ACCENT_COLOR: "accent_color",
  DATA_MODE_OVERRIDE: "data_mode_override",
  NETWORK_TYPE: "network_type",
  FEED_CURSOR_FOR_YOU: "feed_cursor_fy",
  FEED_CURSOR_FOLLOWING: "feed_cursor_fw",
  FEED_SCROLL_OFFSET: "feed_scroll_offset",
  VIEWED_POST_IDS: "viewed_post_ids",
  CHAT_DRAFT_PREFIX: "chat_draft_",
  LAST_SEEN_PREFIX: "last_seen_",
  WALLET_BALANCE: "wallet_balance",
  WALLET_CACHED_AT: "wallet_cached_at",
  APP_LOCK_ENABLED: "app_lock_enabled",
  ONBOARDING_DONE: "onboarding_done",
  SEARCH_HISTORY: "search_history",
  INTERESTS: "user_interests",
  LANGUAGE: "app_language",
  HANDLE_CHANGED_AT_PREFIX: "handle_changed_at_",
  NAME_CHANGED_AT_PREFIX: "name_changed_at_",
} as const;
