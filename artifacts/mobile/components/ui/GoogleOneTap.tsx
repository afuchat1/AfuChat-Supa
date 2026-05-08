import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const GOOGLE_CLIENT_ID =
  "830762767270-lmefgjjk25i17lithkq6iisjv8gfh08d.apps.googleusercontent.com";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, any>) => void;
          prompt: (callback?: (notification: any) => void) => void;
          cancel: () => void;
          renderButton: (element: HTMLElement, config: Record<string, any>) => void;
        };
      };
    };
    handleGoogleOneTap?: (response: { credential: string }) => void;
  }
}

export default function GoogleOneTap() {
  const { session, loading } = useAuth();
  const initialized = useRef(false);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    // Web only — native uses the React Native account picker in googleAuth.ts
    if (Platform.OS !== "web") return;
    if (loading) return;
    if (session) {
      window.google?.accounts?.id?.cancel();
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    window.handleGoogleOneTap = async (response: { credential: string }) => {
      try {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
        });
        if (!error) {
          const uid = data.user?.id;
          if (uid) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("onboarding_completed")
              .eq("id", uid)
              .maybeSingle();
            if (!prof?.onboarding_completed) {
              router.replace({ pathname: "/onboarding", params: { userId: uid } } as any);
              return;
            }
          }
          router.replace("/(tabs)");
        }
      } catch (_) {}
    };

    function initGSI() {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: window.handleGoogleOneTap,
        auto_select: true,
        cancel_on_tap_outside: false,
        itp_support: true,
      });
      window.google.accounts.id.prompt();
    }

    if (window.google?.accounts?.id) {
      initGSI();
      return;
    }

    if (scriptLoaded.current) return;
    scriptLoaded.current = true;

    const existing = document.getElementById("gsi-script");
    if (existing) {
      existing.addEventListener("load", initGSI);
      return;
    }

    const script = document.createElement("script");
    script.id = "gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGSI;
    document.head.appendChild(script);

    return () => {
      window.google?.accounts?.id?.cancel();
    };
  }, [session, loading]);

  return null;
}
