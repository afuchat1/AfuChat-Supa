import { useEffect, useRef } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function IndexScreen() {
  const { session, profile, loading } = useAuth();
  const redirected = useRef(false);
  const { handle } = useLocalSearchParams<{ handle?: string }>();

  function doRedirect(hasSession: boolean, profileReady: boolean, profileOnboarded: boolean, userId?: string) {
    if (redirected.current) return;
    redirected.current = true;
    if (hasSession) {
      if (profileReady && !profileOnboarded && userId) {
        router.replace({ pathname: "/onboarding", params: { userId } });
      } else {
        router.replace("/(tabs)");
      }
    } else {
      router.replace("/(tabs)/discover");
    }
  }

  useEffect(() => {
    if (!handle || redirected.current || loading) return;
    redirected.current = true;
    router.replace(`/${handle}` as any);
  }, [handle, loading]);

  useEffect(() => {
    if (loading) return;
    if (handle) return;
    doRedirect(
      !!session,
      !!profile,
      profile?.onboarding_completed ?? true,
      session?.user?.id,
    );
  }, [session, profile, loading, handle]);

  // Instant fallback — if auth hasn't resolved within 1.5 s, go straight to
  // the public discover feed. Auth context will redirect again once ready.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!redirected.current) {
        redirected.current = true;
        if (handle) {
          router.replace(`/${handle}` as any);
        } else {
          router.replace("/(tabs)/discover");
        }
      }
    }, 1500);
    return () => clearTimeout(timeout);
  }, [handle]);

  return <View style={{ flex: 1 }} />;
}
