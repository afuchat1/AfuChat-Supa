import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { patchLocalSetting } from "@/lib/storage/localSettings";

const CHAT_PREF_TO_LOCAL: Partial<Record<string, string>> = {
  read_receipts: "chat_read_receipts",
  bubble_style:  "chat_bubble_style",
  auto_download: "chat_media_autodownload",
};

const APP_ACCENT_KEY = "app_color_theme";
const LOCAL_PREFS_KEY = "chat_prefs_local";
const PENDING_SERVER_PREFS_KEY = "chat_prefs_pending_server";

// These keys are stored server-side (Supabase chat_preferences table)
const SERVER_KEYS = new Set([
  "chat_theme", "bubble_style", "font_size", "sounds_enabled", "auto_download",
  "read_receipts", "chat_lock", "enter_to_send", "media_quality", "save_to_gallery",
  "link_previews", "typing_indicators", "archive_on_delete", "chat_backup",
  "screenshot_protection",
]);

export type ChatTheme =
  | "Teal" | "Indigo" | "Emerald" | "Purple";

export type BubbleStyle = "Rounded" | "Sharp" | "Minimal";
export type MediaQuality = "Auto" | "High" | "Low";

export type ChatPrefs = {
  // ── Server-side prefs ──
  chat_theme: ChatTheme;
  bubble_style: BubbleStyle;
  font_size: number;
  sounds_enabled: boolean;
  auto_download: boolean;
  read_receipts: boolean;
  chat_lock: boolean;
  enter_to_send: boolean;
  media_quality: MediaQuality;
  save_to_gallery: boolean;
  link_previews: boolean;
  typing_indicators: boolean;
  archive_on_delete: boolean;
  chat_backup: boolean;
  screenshot_protection: boolean;
  // ── Client-side prefs (AsyncStorage) ──
  compact_mode: boolean;
  reactions_enabled: boolean;
  autoplay_gifs: boolean;
  send_haptics: boolean;
  message_grouping: boolean;
};

export const CHAT_THEME_COLORS: Record<string, { bubble: string; bubbleText: string; accent: string }> = {
  Teal:     { bubble: "#1018D8", bubbleText: "#fff", accent: "#1018D8" },
  Purple:   { bubble: "#7B2FBE", bubbleText: "#fff", accent: "#7B2FBE" },
  Indigo:   { bubble: "#3835A3", bubbleText: "#fff", accent: "#3835A3" },
  Emerald:  { bubble: "#198A3E", bubbleText: "#fff", accent: "#198A3E" },
};

export const ACCENT_SWATCHES: { key: ChatTheme; label: string }[] = [
  { key: "Teal",    label: "AfuChat" },
  { key: "Indigo",  label: "Indigo"  },
  { key: "Emerald", label: "Emerald" },
  { key: "Purple",  label: "Purple"  },
];

export const BUBBLE_RADIUS: Record<BubbleStyle, number> = {
  Rounded: 18,
  Sharp: 4,
  Minimal: 10,
};

export const defaults: ChatPrefs = {
  chat_theme: "Teal",
  bubble_style: "Rounded",
  font_size: 15,
  sounds_enabled: true,
  auto_download: true,
  read_receipts: true,
  chat_lock: false,
  enter_to_send: false,
  media_quality: "Auto",
  save_to_gallery: false,
  link_previews: true,
  typing_indicators: true,
  archive_on_delete: false,
  chat_backup: false,
  compact_mode: false,
  reactions_enabled: true,
  autoplay_gifs: true,
  screenshot_protection: false,
  send_haptics: true,
  message_grouping: true,
};

type ChatPrefsContextType = {
  prefs: ChatPrefs;
  loading: boolean;
  updatePref: <K extends keyof ChatPrefs>(key: K, value: ChatPrefs[K]) => Promise<void>;
  reload: () => Promise<void>;
  themeColors: typeof CHAT_THEME_COLORS[string];
  bubbleRadius: number;
};

const ChatPreferencesContext = createContext<ChatPrefsContextType>({
  prefs: defaults,
  loading: true,
  updatePref: async () => {},
  reload: async () => {},
  themeColors: CHAT_THEME_COLORS["Teal"],
  bubbleRadius: BUBBLE_RADIUS["Rounded"],
});

export function ChatPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ChatPrefs>(defaults);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setPrefs(defaults);
      setLoading(false);
      return;
    }
    try {
      // Read local values first. They are the only source of truth while the
      // device is offline, and must not be lost just because the server query
      // is unavailable.
      const [localRaw, pendingRaw] = await Promise.all([
        AsyncStorage.getItem(LOCAL_PREFS_KEY + "_" + user.id),
        AsyncStorage.getItem(PENDING_SERVER_PREFS_KEY + "_" + user.id),
      ]);
      let localPrefs: Partial<ChatPrefs> = {};
      let pendingServerPrefs: Partial<ChatPrefs> = {};
      try {
        localPrefs = localRaw ? JSON.parse(localRaw) : {};
      } catch {
        localPrefs = {};
      }
      try {
        pendingServerPrefs = pendingRaw ? JSON.parse(pendingRaw) : {};
      } catch {
        pendingServerPrefs = {};
      }
      // Older builds stored this key locally. It is now server-side so the
      // other participants can enforce the same policy in their chat.
      delete localPrefs.screenshot_protection;

      // Load server-side prefs. Supabase returns errors instead of throwing,
      // so check the error explicitly before treating the response as valid.
      const { data, error: serverError } = await supabase
        .from("chat_preferences")
        .select("user_id, chat_theme, bubble_style, font_size, sounds_enabled, auto_download, read_receipts, chat_lock, enter_to_send, media_quality, save_to_gallery, link_previews, typing_indicators, archive_on_delete, chat_backup, screenshot_protection")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!serverError && Object.keys(pendingServerPrefs).length > 0) {
        const { error: pendingError } = await supabase
          .from("chat_preferences")
          .upsert({ user_id: user.id, ...pendingServerPrefs }, { onConflict: "user_id" });
        if (!pendingError) {
          await AsyncStorage.removeItem(PENDING_SERVER_PREFS_KEY + "_" + user.id);
          pendingServerPrefs = {};
        }
      }

      // Pending writes win over a stale server snapshot. This keeps a setting
      // changed offline visible immediately and lets the next online load sync
      // it without reverting the switch.
      const mergedPrefs: ChatPrefs = {
        ...defaults,
        ...(data ?? {}),
        ...localPrefs,
        ...pendingServerPrefs,
      };
      setPrefs(mergedPrefs);
    } catch {
      // Keep the defaults available offline, but never leave the settings
      // screen in a permanent loading state.
      try {
        const raw = await AsyncStorage.getItem(LOCAL_PREFS_KEY + "_" + user.id);
        const localPrefs = raw ? JSON.parse(raw) : {};
        delete localPrefs.screenshot_protection;
        const fallbackPrefs = { ...defaults, ...localPrefs };
        setPrefs(fallbackPrefs);
      } catch {
        setPrefs(defaults);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const updatePref = useCallback(async <K extends keyof ChatPrefs>(key: K, value: ChatPrefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));

    if (key === "chat_theme") AsyncStorage.setItem(APP_ACCENT_KEY, value as string).catch(() => {});
    const localKey = CHAT_PREF_TO_LOCAL[key as string];
    if (localKey && user) {
      let localVal: any = value;
      if (key === "auto_download") localVal = (value as boolean) ? "wifi_only" : "never";
      patchLocalSetting(user.id, localKey as any, localVal).catch(() => {});
    }

    if (SERVER_KEYS.has(key as string)) {
      // Persist to Supabase
      if (!user) return;
      try {
        const { error } = await supabase
          .from("chat_preferences")
          .upsert({ user_id: user.id, [key]: value }, { onConflict: "user_id" });
        if (error) throw error;
        const pendingKey = PENDING_SERVER_PREFS_KEY + "_" + user.id;
        const raw = await AsyncStorage.getItem(pendingKey);
        if (raw) {
          const pending = JSON.parse(raw) as Record<string, unknown>;
          delete pending[key as string];
          if (Object.keys(pending).length > 0) {
            await AsyncStorage.setItem(pendingKey, JSON.stringify(pending));
          } else {
            await AsyncStorage.removeItem(pendingKey);
          }
        }
      } catch (error) {
        // Keep the user's choice across an offline session. The next load
        // retries the pending server write instead of silently reverting.
        try {
          const pendingKey = PENDING_SERVER_PREFS_KEY + "_" + user.id;
          const raw = await AsyncStorage.getItem(pendingKey);
          const pending = raw ? JSON.parse(raw) : {};
          await AsyncStorage.setItem(pendingKey, JSON.stringify({ ...pending, [key]: value }));
        } catch {}
        console.warn("[ChatPreferences] server sync deferred", key, error);
      }
    } else {
      // Persist client-only prefs to AsyncStorage
      if (!user) return;
      try {
        const storageKey = LOCAL_PREFS_KEY + "_" + user.id;
        const raw = await AsyncStorage.getItem(storageKey);
        const existing = raw ? JSON.parse(raw) : {};
        await AsyncStorage.setItem(storageKey, JSON.stringify({ ...existing, [key]: value }));
      } catch {}
    }
  }, [user]);

  const themeColors = CHAT_THEME_COLORS[prefs.chat_theme] || CHAT_THEME_COLORS["Teal"];
  const bubbleRadius = BUBBLE_RADIUS[prefs.bubble_style] || BUBBLE_RADIUS["Rounded"];

  return (
    <ChatPreferencesContext.Provider value={{ prefs, loading, updatePref, reload: load, themeColors, bubbleRadius }}>
      {children}
    </ChatPreferencesContext.Provider>
  );
}

export function useChatPreferences() {
  return useContext(ChatPreferencesContext);
}
