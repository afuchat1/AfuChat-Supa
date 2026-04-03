import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export type ActivityStatus = "online" | "busy" | "focus" | "offline" | "last_seen";

export type AdvancedFeatureSettings = {
  activity_status: ActivityStatus;
  focus_mode: boolean;
  offline_drafts: boolean;
};

const defaults: AdvancedFeatureSettings = {
  activity_status: "online",
  focus_mode: false,
  offline_drafts: true,
};

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
      .select("activity_status, focus_mode, offline_drafts")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFeatures({ ...defaults, ...data });
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
      const inFocus = value as boolean;
      const showOnline = inFocus;
      await supabase.from("profiles").update({ show_online_status: showOnline }).eq("id", user.id);
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
