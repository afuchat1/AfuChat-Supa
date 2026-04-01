import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

export default function AuthCallbackScreen() {
  const [status, setStatus] = useState("Signing you in…");
  const handled = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function handleSession(session: any) {
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
      await new Promise((r) => setTimeout(r, 300));
      if (mounted) router.replace("/(tabs)");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_IN" && session) {
          await handleSession(session);
        } else if (event === "INITIAL_SESSION") {
          if (session) {
            await handleSession(session);
          } else {
            if (mounted) {
              setStatus("Redirecting to login…");
              router.replace("/(auth)/login");
            }
          }
        }
      }
    );

    const safetyTimeout = setTimeout(async () => {
      if (handled.current || !mounted) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await handleSession(session);
      } else if (mounted) {
        router.replace("/(auth)/login");
      }
    }, 6000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
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
