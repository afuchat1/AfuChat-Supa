import { Platform } from "react-native";

// ─── Web-safe MMKV wrapper ─────────────────────────────────────────────────────
// On native (Android/iOS): uses react-native-mmkv — synchronous, JSI, ~30x faster
// than AsyncStorage and survives app restarts.
// On web: falls back to a synchronous in-memory store backed by localStorage so
// the same API works everywhere without conditional imports in consuming modules.

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

function createWebStore(): MMKVLike {
  const PREFIX = "afu_mmkv_";
  const mem = new Map<string, string | number | boolean>();

  // Hydrate from localStorage once.
  if (typeof localStorage !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        try {
          const raw = localStorage.getItem(k)!;
          const parsed = JSON.parse(raw);
          mem.set(k.slice(PREFIX.length), parsed);
        } catch {}
      }
    }
  }

  function persist(key: string, value: string | number | boolean) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {}
  }

  return {
    set(key, value) {
      mem.set(key, value);
      persist(key, value);
    },
    getString(key) {
      const v = mem.get(key);
      return typeof v === "string" ? v : undefined;
    },
    getNumber(key) {
      const v = mem.get(key);
      return typeof v === "number" ? v : undefined;
    },
    getBoolean(key) {
      const v = mem.get(key);
      return typeof v === "boolean" ? v : undefined;
    },
    delete(key) {
      mem.delete(key);
      try { localStorage.removeItem(PREFIX + key); } catch {}
    },
    contains(key) { return mem.has(key); },
    getAllKeys() { return Array.from(mem.keys()); },
    clearAll() {
      const keys = Array.from(mem.keys());
      mem.clear();
      keys.forEach((k) => {
        try { localStorage.removeItem(PREFIX + k); } catch {}
      });
    },
  };
}

let _store: MMKVLike | null = null;

/**
 * Returns true when we're running inside Expo Go (the store client).
 * react-native-mmkv v4 uses react-native-nitro-modules whose native code is
 * NOT bundled in Expo Go — attempting to require it throws a fatal Hermes
 * error that bypasses JavaScript try/catch. We detect this environment first
 * so we can skip MMKV entirely and use the in-memory/localStorage fallback.
 */
function isExpoGo(): boolean {
  try {
    // expo-constants is always available in Expo projects.
    // executionEnvironment is "storeClient" in Expo Go and "bare" in builds.
    const Constants = require("expo-constants").default;
    return Constants?.executionEnvironment === "storeClient";
  } catch {
    return false;
  }
}

function getStore(): MMKVLike {
  if (_store) return _store;
  if (Platform.OS === "web" || isExpoGo()) {
    _store = createWebStore();
  } else {
    try {
      const { MMKV } = require("react-native-mmkv") as typeof import("react-native-mmkv");
      _store = new MMKV({ id: "afuchat-store" });
    } catch {
      _store = createWebStore();
    }
  }
  return _store;
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
  clearAll() { getStore().clearAll(); },

  // Convenience: store with TTL — returns undefined if expired
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
  UNREAD_NOTIF_COUNT: "unread_notif_count",
  PUSH_TOKEN: "push_token",
  CHAT_DRAFT_PREFIX: "chat_draft_",
  LAST_SEEN_PREFIX: "last_seen_",
  WALLET_BALANCE: "wallet_balance",
  WALLET_CACHED_AT: "wallet_cached_at",
  APP_LOCK_ENABLED: "app_lock_enabled",
  ONBOARDING_DONE: "onboarding_done",
  SEARCH_HISTORY: "search_history",
  INTERESTS: "user_interests",
  LANGUAGE: "app_language",
} as const;
