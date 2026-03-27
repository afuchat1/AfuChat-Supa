import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translateText, LANG_LABELS } from "@/lib/translate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const STORAGE_KEY = "@afuchat:lang_pref";

type LanguageContextType = {
  preferredLang: string | null;
  langLabel: string;
  setPreferredLang: (lang: string | null) => Promise<void>;
  autoTranslate: (text: string) => Promise<string>;
};

const LanguageContext = createContext<LanguageContextType>({
  preferredLang: null,
  langLabel: "Off",
  setPreferredLang: async () => {},
  autoTranslate: async (t) => t,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferredLang, setPreferredLangState] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored !== "none") setPreferredLangState(stored);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("advanced_feature_settings")
      .select("message_translation, translation_language")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const lang =
          data.message_translation && data.translation_language
            ? data.translation_language
            : null;
        setPreferredLangState(lang);
        AsyncStorage.setItem(STORAGE_KEY, lang ?? "none");
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`lang_watch_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "advanced_feature_settings",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          const lang =
            row.message_translation && row.translation_language
              ? row.translation_language
              : null;
          setPreferredLangState(lang);
          AsyncStorage.setItem(STORAGE_KEY, lang ?? "none");
        }
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [user]);

  async function setPreferredLang(lang: string | null) {
    setPreferredLangState(lang);
    await AsyncStorage.setItem(STORAGE_KEY, lang ?? "none");
    if (user) {
      await supabase.from("advanced_feature_settings").upsert(
        {
          user_id: user.id,
          message_translation: !!lang,
          translation_language: lang ?? "en",
        },
        { onConflict: "user_id" }
      );
    }
  }

  async function autoTranslate(text: string): Promise<string> {
    if (!preferredLang || !text?.trim()) return text;
    return translateText(text, preferredLang);
  }

  const langLabel = preferredLang
    ? (LANG_LABELS[preferredLang] ?? preferredLang)
    : "Off";

  return (
    <LanguageContext.Provider
      value={{ preferredLang, langLabel, setPreferredLang, autoTranslate }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useAutoTranslate(text: string | null | undefined) {
  const { preferredLang } = useLanguage();
  const [displayText, setDisplayText] = useState(text || "");
  const [isTranslated, setIsTranslated] = useState(false);

  useEffect(() => {
    setDisplayText(text || "");
    setIsTranslated(false);
    if (!preferredLang || !text?.trim()) return;
    let cancelled = false;
    translateText(text, preferredLang).then((result) => {
      if (!cancelled && result && result !== text) {
        setDisplayText(result);
        setIsTranslated(true);
      }
    });
    return () => { cancelled = true; };
  }, [preferredLang, text]);

  return { displayText, isTranslated, lang: preferredLang };
}
