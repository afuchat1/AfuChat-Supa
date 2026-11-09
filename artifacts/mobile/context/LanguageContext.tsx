import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translateUserContent as translateUserContentWithGoogle } from "@/lib/translate";
import { LANG_LABELS, isBundledUiLanguage, setLocale, subscribeUiTranslations, t as translateUi, tp as translatePlural } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { storage, KEYS } from "@/lib/storage/mmkv";

export const LANGUAGE_PREFERENCE_KEY = "@afuchat:lang_pref";

function normalizeLanguage(value: string | null | undefined): string | null {
  if (!value || value === "none") return null;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  const aliases: Record<string, string> = {
    english: "en",
    swahili: "sw",
    kiswahili: "sw",
    french: "fr",
    français: "fr",
    spanish: "es",
    español: "es",
    arabic: "ar",
    العربية: "ar",
    amharic: "am",
    "አማርኛ": "am",
    kinyarwanda: "rw",
  };
  return aliases[normalized] ?? normalized.split("-")[0];
}

type LanguageContextType = {
  preferredLang: string | null;
  langLabel: string;
  isRTL: boolean;
  setPreferredLang: (lang: string | null) => Promise<void>;
  translateUserContent: (text: string) => Promise<string>;
  voiceToText: boolean;
  textToSpeech: boolean;
  t: (text: string, params?: Record<string, string | number>) => string;
  tp: (singular: string, plural: string, count: number, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  preferredLang: null,
  langLabel: "Off",
  isRTL: false,
  setPreferredLang: async () => {},
  translateUserContent: async (t) => t,
  voiceToText: false,
  textToSpeech: false,
  t: (text) => text,
  tp: (singular, plural, count) => count === 1 ? singular : plural,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferredLang, setPreferredLangState] = useState<string | null>(() => {
    try {
      const cached = normalizeLanguage(storage.getString(KEYS.LANGUAGE));
      return cached && isBundledUiLanguage(cached) ? cached : null;
    } catch {
      return null;
    }
  });
  const [voiceToText, setVoiceToText] = useState(false);
  const [textToSpeech, setTextToSpeech] = useState(false);
  const [uiTranslationVersion, setUiTranslationVersion] = useState(0);
  const userRef = useRef(user);
  const hasLocalLanguageChange = useRef(false);
  const languageChangeIdRef = useRef(0);
  const languagePersistQueueRef = useRef<Promise<void>>(Promise.resolve());
  userRef.current = user;

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY)
      .then((stored) => {
        const lang = normalizeLanguage(stored);
        if (stored === null) return;
        if (hasLocalLanguageChange.current) return;
        const safeLang = lang && !isBundledUiLanguage(lang) ? "en" : lang;
        setPreferredLangState(safeLang);
        setLocale(safeLang);
      })
      .catch(() => {});
  }, []);

  async function fetchSettings(uid: string) {
    const [{ data: featureData }, { data: profileData }] = await Promise.all([
      supabase
        .from("advanced_feature_settings")
        .select("voice_to_text, text_to_speech")
        .eq("user_id", uid)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("language")
        .eq("id", uid)
        .maybeSingle(),
    ]);

    // A device preference is authoritative when it exists. On a new device,
    // restore the app language saved on the user's profile instead of using
    // the message-translation toggle as a proxy for the whole UI.
    const stored = await AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    if (!hasLocalLanguageChange.current) {
      const requestedLang = stored !== null
        ? normalizeLanguage(stored)
        : normalizeLanguage(profileData?.language) ?? "en";
      const lang = requestedLang && !isBundledUiLanguage(requestedLang)
        ? "en"
        : requestedLang;
      setPreferredLangState(lang);
      setLocale(lang);
      await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, lang ?? "none");
      try {
        storage.setString(KEYS.LANGUAGE, lang ?? "en");
      } catch {}
    }
    setVoiceToText(!!featureData?.voice_to_text);
    setTextToSpeech(!!featureData?.text_to_speech);
  }

  useEffect(() => {
    if (!user) return;
    fetchSettings(user.id).catch(() => {});
  }, [user]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && userRef.current) {
        fetchSettings(userRef.current.id).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => subscribeUiTranslations(() => {
    setUiTranslationVersion((version) => version + 1);
  }), []);

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
          setVoiceToText(!!row.voice_to_text);
          setTextToSpeech(!!row.text_to_speech);
        }
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [user]);

  async function setPreferredLang(lang: string | null) {
    hasLocalLanguageChange.current = true;
    const changeId = ++languageChangeIdRef.current;
    const requestedLang = normalizeLanguage(lang);
    const normalizedLang = requestedLang && !isBundledUiLanguage(requestedLang)
      ? "en"
      : requestedLang;

    // Update the live UI synchronously. Persistence is queued below so a
    // rapid wrong-language -> new-language change cannot finish out of order.
    setPreferredLangState(normalizedLang);
    setLocale(normalizedLang);

    languagePersistQueueRef.current = languagePersistQueueRef.current
      .catch(() => {})
      .then(async () => {
        // Older queued changes are intentionally discarded once a newer
        // selection exists.
        if (changeId !== languageChangeIdRef.current) return;

        await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, normalizedLang ?? "none");
        if (changeId !== languageChangeIdRef.current) return;

        try {
          storage.setString(KEYS.LANGUAGE, normalizedLang ?? "en");
        } catch {}

        const activeUser = userRef.current;
        if (!activeUser || changeId !== languageChangeIdRef.current) return;

        await Promise.all([
          supabase.from("profiles").update({ language: normalizedLang ?? "en" }).eq("id", activeUser.id),
          supabase.from("advanced_feature_settings").upsert(
            {
              user_id: activeUser.id,
              message_translation: !!normalizedLang,
              translation_language: normalizedLang ?? "en",
            },
            { onConflict: "user_id" },
          ),
        ]);
      });

    await languagePersistQueueRef.current;
  }

  async function translateUserContent(text: string): Promise<string> {
    if (!preferredLang || !text?.trim()) return text;
    return translateUserContentWithGoogle(text, preferredLang);
  }

  const langLabel = preferredLang
    ? (LANG_LABELS[preferredLang] ?? preferredLang)
    : "Off";
  // Arabic is supported as translated copy, but AfuChat's controls and
  // containers always use the same left-to-right layout.
  const isRTL = false;
  // Keep non-hook callers used by the Babel transform in sync during the same
  // render that observes a language change, not one render later.
  setLocale(preferredLang);
  const t = useCallback(
    (text: string, params?: Record<string, string | number>) => translateUi(text, preferredLang, params),
    [preferredLang, uiTranslationVersion],
  );
  const tp = useCallback(
    (singular: string, plural: string, count: number, params?: Record<string, string | number>) =>
      translatePlural(singular, plural, count, preferredLang, params),
    [preferredLang, uiTranslationVersion],
  );

  return (
    <LanguageContext.Provider
      value={{ preferredLang, langLabel, isRTL, setPreferredLang, translateUserContent, voiceToText, textToSpeech, t, tp }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useUserContentTranslation(text: string | null | undefined) {
  const { preferredLang } = useLanguage();
  const [displayText, setDisplayText] = useState(text || "");
  const [isTranslated, setIsTranslated] = useState(false);

  useEffect(() => {
    setDisplayText(text || "");
    setIsTranslated(false);
    if (!preferredLang || !text?.trim()) return;
    let cancelled = false;
    translateUserContentWithGoogle(text, preferredLang).then((result) => {
      if (!cancelled && result && result !== text) {
        setDisplayText(result);
        setIsTranslated(true);
      }
    });
    return () => { cancelled = true; };
  }, [preferredLang, text]);

  return { displayText, isTranslated, lang: preferredLang };
}
