import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export type ActivityStatus = "online" | "busy" | "focus" | "offline" | "last_seen";

export type AdvancedFeatureSettings = {
  activity_status: ActivityStatus;
  focus_mode: boolean;
  focus_mode_schedule: boolean;
  mini_profile_popup: boolean;
  offline_drafts: boolean;
  show_typing_indicator: boolean;
  interactive_link_preview: boolean;
  auto_media_organization: boolean;
  emoji_reactions_advanced: boolean;
  message_reminders: boolean;
  message_edit_history: boolean;
  chat_to_post: boolean;
  quick_action_menu: boolean;
  drag_drop_upload: boolean;
  user_tagging: boolean;
  in_app_browser: boolean;
  smart_notifications: boolean;
  message_translation: boolean;
  translation_language: string;
  voice_to_text: boolean;
  text_to_speech: boolean;
  chat_folders: boolean;
  temp_chat_enabled: boolean;
  temp_chat_default_minutes: number;
  auto_reply_enabled: boolean;
  auto_reply_message: string;
  chat_summary: boolean;
  keyword_alerts: boolean;
  keyword_alerts_list: string;
  chat_export_format: string;
  content_filter_topics: boolean;
  content_filter_keywords: string;
  split_screen_mode: boolean;
  cross_device_sync: boolean;
  group_roles_system: boolean;
  screen_share: boolean;
};

const defaults: AdvancedFeatureSettings = {
  activity_status: "online",
  focus_mode: false,
  focus_mode_schedule: false,
  mini_profile_popup: true,
  offline_drafts: true,
  show_typing_indicator: true,
  interactive_link_preview: true,
  auto_media_organization: true,
  emoji_reactions_advanced: true,
  message_reminders: true,
  message_edit_history: true,
  chat_to_post: true,
  quick_action_menu: true,
  drag_drop_upload: true,
  user_tagging: true,
  in_app_browser: true,
  smart_notifications: true,
  message_translation: false,
  translation_language: "en",
  voice_to_text: false,
  text_to_speech: false,
  chat_folders: false,
  temp_chat_enabled: false,
  temp_chat_default_minutes: 60,
  auto_reply_enabled: false,
  auto_reply_message: "I'm currently unavailable. I'll reply soon!",
  chat_summary: false,
  keyword_alerts: false,
  keyword_alerts_list: "",
  chat_export_format: "pdf",
  content_filter_topics: false,
  content_filter_keywords: "",
  split_screen_mode: false,
  cross_device_sync: true,
  group_roles_system: false,
  screen_share: false,
};

const COLUMNS = Object.keys(defaults).join(", ");

type AdvancedFeaturesContextType = {
  features: AdvancedFeatureSettings;
  loading: boolean;
  setFeature: <K extends keyof AdvancedFeatureSettings>(key: K, value: AdvancedFeatureSettings[K]) => Promise<void>;
};

const AdvancedFeaturesContext = createContext<AdvancedFeaturesContextType>({
  features: defaults,
  loading: true,
  setFeature: async () => {},
});

export function AdvancedFeaturesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [features, setFeatures] = useState<AdvancedFeatureSettings>(defaults);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from("advanced_feature_settings")
      .select(COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFeatures({ ...defaults, ...(data as any) });
        setLoading(false);
      });
  }, [user?.id]);

  const setFeature = useCallback(async <K extends keyof AdvancedFeatureSettings>(
    key: K,
    value: AdvancedFeatureSettings[K],
  ) => {
    setFeatures((prev) => ({ ...prev, [key]: value }));
    if (!user) return;

    await supabase
      .from("advanced_feature_settings")
      .upsert({ user_id: user.id, [key]: value }, { onConflict: "user_id" });

    if (key === "activity_status") {
      const status = value as ActivityStatus;
      const showOnline = status === "online" || status === "busy" || status === "focus";
      const profileUpdate: Record<string, any> = { show_online_status: showOnline };
      if (status === "offline" || status === "last_seen") {
        profileUpdate.last_seen = new Date().toISOString();
      }
      await supabase.from("profiles").update(profileUpdate).eq("id", user.id);
    }

    if (key === "focus_mode") {
      await supabase.from("profiles").update({ show_online_status: !(value as boolean) }).eq("id", user.id);
    }
  }, [user]);

  return (
    <AdvancedFeaturesContext.Provider value={{ features, loading, setFeature }}>
      {children}
    </AdvancedFeaturesContext.Provider>
  );
}

export function useAdvancedFeatures() {
  return useContext(AdvancedFeaturesContext);
}
