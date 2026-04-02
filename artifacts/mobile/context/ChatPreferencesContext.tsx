import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export type ChatTheme = "Teal" | "Blue" | "Purple" | "Rose" | "Amber" | "Emerald";
export type BubbleStyle = "Rounded" | "Sharp" | "Minimal";
export type MediaQuality = "Auto" | "High" | "Low";

export type ChatPrefs = {
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
};

export const CHAT_THEME_COLORS: Record<ChatTheme, { bubble: string; bubbleText: string; accent: string }> = {
  Teal:    { bubble: "#00BCD4", bubbleText: "#fff", accent: "#00BCD4" },
  Blue:    { bubble: "#007AFF", bubbleText: "#fff", accent: "#007AFF" },
  Purple:  { bubble: "#AF52DE", bubbleText: "#fff", accent: "#AF52DE" },
  Rose:    { bubble: "#FF2D55", bubbleText: "#fff", accent: "#FF2D55" },
  Amber:   { bubble: "#FF9500", bubbleText: "#fff", accent: "#FF9500" },
  Emerald: { bubble: "#34C759", bubbleText: "#fff", accent: "#34C759" },
};

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
};

type ChatPrefsContextType = {
  prefs: ChatPrefs;
  loading: boolean;
  updatePref: <K extends keyof ChatPrefs>(key: K, value: ChatPrefs[K]) => Promise<void>;
  reload: () => Promise<void>;
  themeColors: typeof CHAT_THEME_COLORS[ChatTheme];
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
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("chat_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setPrefs({ ...defaults, ...data });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const updatePref = useCallback(async <K extends keyof ChatPrefs>(key: K, value: ChatPrefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (!user) return;
    await supabase
      .from("chat_preferences")
      .upsert({ user_id: user.id, [key]: value }, { onConflict: "user_id" });
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
