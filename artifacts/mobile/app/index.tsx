import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import LandingPage from "@/components/landing/LandingPage";

export default function IndexScreen() {
  const { session, profile, loading } = useAuth();
  const redirected = useRef(false);
  const { handle } = useLocalSearchParams<{ handle?: string }>();

  // ── Web: always show the landing page — no auto-redirects ──
  // Logged-in users navigate via the "Open App" button in the navbar.
  if (Platform.OS === "web") {
    return <LandingPage />;
  }

  // ── Native only below this point ──

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

  // Native fallback — if auth hasn't resolved within 1.5 s, go to discover.
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

  // Native: render nothing while auth resolves (redirect fires in useEffect)
  return null;
}
