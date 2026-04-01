import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

export default function AuthCallbackScreen() {
  const [status, setStatus] = useState("Signing you in…");
  const handled = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function upsertAndRedirect(session: any) {
      if (!session || handled.current) return;
      handled.current = true;

      try {
        const user = session.user;
        const meta = user.user_metadata || {};
        const rawHandle =
          meta.user_name ||
          meta.preferred_username ||
          user.email?.split("@")[0] ||
          "user";
        const handle = String(rawHandle)
          .replace(/[^a-zA-Z0-9_]/g, "")
          .slice(0, 30) || "user";

        await supabase.from("profiles").upsert(
          {
            id: user.id,
            handle,
            display_name: meta.full_name || meta.name || handle,
            avatar_url: meta.avatar_url || meta.picture || null,
          },
          { onConflict: "id", ignoreDuplicates: false }
        );
      } catch (_) {}

      if (!mounted) return;
      setStatus("Welcome to AfuChat!");
      await new Promise((r) => setTimeout(r, 200));
      if (mounted) router.replace("/(tabs)");
    }

    async function exchangeAndRedirect() {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          const code = urlParams.get("code");

          if (code) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error && data.session) {
              await upsertAndRedirect(data.session);
              return;
            }
          }

          if (window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get("access_token");
            const refreshToken = hashParams.get("refresh_token");
            if (accessToken && refreshToken) {
              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (!error && data.session) {
                await upsertAndRedirect(data.session);
                return;
              }
            }
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await upsertAndRedirect(session);
          return;
        }
      } catch (_) {}

      if (!handled.current && mounted) {
        setTimeout(() => {
          if (!handled.current && mounted) {
            router.replace("/(auth)/login");
          }
        }, 2000);
      }
    }

    exchangeAndRedirect();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
          await upsertAndRedirect(session);
        } else if (event === "INITIAL_SESSION" && session) {
          await upsertAndRedirect(session);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>AfuChat</Text>
      <ActivityIndicator size="large" color="rgba(255,255,255,0.9)" style={styles.spinner} />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.brand,
    gap: 0,
  },
  brand: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.5,
    marginBottom: 40,
  },
  spinner: {
    marginBottom: 24,
  },
  status: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
});
