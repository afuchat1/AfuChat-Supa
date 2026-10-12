import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { getCachedUserId } from "@/lib/offlineStore";
import { storage, KEYS } from "@/lib/storage/mmkv";
import { safeRouter } from "@/lib/navUtils";
import { handleIncomingUrl, isAfuChatDeepLink } from "@/lib/deepLinkHandler";
import { LANGUAGE_PREFERENCE_KEY } from "@/context/LanguageContext";

export default function IndexScreen() {
  const { session, profile, loading, user } = useAuth();
  const redirected = useRef(false);
  const [initialUrlChecked, setInitialUrlChecked] = useState(false);
  const [initialDeepLinkPending, setInitialDeepLinkPending] = useState(false);
  const [languageChecked, setLanguageChecked] = useState(false);
  const [languageSelected, setLanguageSelected] = useState(false);
  const { handle } = useLocalSearchParams<{ handle?: string }>();

  useEffect(() => {
    let mounted = true;
    let settled = false;
    const timeout = setTimeout(() => {
      if (!mounted || settled) return;
      settled = true;
      console.warn("[AfuChat boot] Initial URL check timed out; continuing without a deep link");
      setInitialDeepLinkPending(false);
      setInitialUrlChecked(true);
    }, 4500);

    Linking.getInitialURL().catch(() => null).then(async (url) => {
      if (!mounted || settled) return;
      let hasPendingAction = false;
      if (isAfuChatDeepLink(url)) {
        // Resolve the action only to stop the ordinary boot redirect from
        // racing the root deep-link gate, which owns actual navigation.
        const action = await Promise.race([
          handleIncomingUrl(url),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
        ]);
        hasPendingAction = !!action;
      }
      if (!mounted || settled) return;
      settled = true;
      clearTimeout(timeout);
      setInitialDeepLinkPending(hasPendingAction);
      setInitialUrlChecked(true);
    }).catch(() => {
      if (!mounted || settled) return;
      settled = true;
      clearTimeout(timeout);
      setInitialDeepLinkPending(false);
      setInitialUrlChecked(true);
    });
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []);

  // Language is the first-run gate. It runs before auth and onboarding
  // routing so a new user can understand the welcome experience.
  useEffect(() => {
    let mounted = true;
    let settled = false;
    const timeout = setTimeout(() => {
      if (!mounted || settled) return;
      settled = true;
      console.warn("[AfuChat boot] Language preference check timed out; showing language setup");
      setLanguageSelected(false);
      setLanguageChecked(true);
    }, 4500);

    AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY)
      .then((stored) => {
        if (!mounted || settled) return;
        settled = true;
        clearTimeout(timeout);
        setLanguageSelected(!!stored && stored !== "none");
        setLanguageChecked(true);
      })
      .catch(() => {
        if (!mounted || settled) return;
        settled = true;
        clearTimeout(timeout);
        setLanguageSelected(false);
        setLanguageChecked(true);
      });
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []);

  function doRedirect(hasSession: boolean, profileReady: boolean, profileOnboarded: boolean) {
    if (redirected.current) return;

    const cachedId  = getCachedUserId();
    // Three signals for "user is logged in" — any one is sufficient:
    //  1. hasSession   — Supabase returned a live session this boot
    //  2. cachedId     — MMKV (or its AsyncStorage backup) has a user ID
    //  3. user?.id     — AuthContext already set a synthetic user from SecureStore
    //     (happens when MMKV fell back to memory store but SecureStore still had tokens)
    const isLoggedIn = hasSession || Boolean(cachedId) || Boolean(user?.id);

    // Not logged in — show welcome onboarding first, then login
    if (!isLoggedIn) {
      redirected.current = true;
      const onboardingDone = (() => { try { return storage.getBoolean(KEYS.ONBOARDING_DONE); } catch { return false; } })();
      safeRouter.replace(onboardingDone ? "/(auth)/login" : "/welcome");
      return;
    }

    // Known returning user — go home INSTANTLY.
    // Use cachedId OR user?.id so SecureStore-restored sessions also skip the wait.
    if (cachedId || user?.id) {
      redirected.current = true;
      if (hasSession && profileReady && profile?.onboarding_completed === false) {
        safeRouter.replace("/onboarding");
      } else {
        safeRouter.replace("/(tabs)/chats");
      }
      return;
    }

    // Brand-new sign-in (no cached ID yet): wait for profile before routing
    if (hasSession && !profileReady) return;

    redirected.current = true;
    if (hasSession && profileReady && !profileOnboarded) {
      safeRouter.replace("/onboarding");
    } else {
      safeRouter.replace("/(tabs)/chats");
    }
  }

  // Handle ?handle= query param for web profile deep links
  useEffect(() => {
    if (!languageChecked || !initialUrlChecked || !handle || redirected.current || loading) return;
    if (!languageSelected) {
      redirected.current = true;
      safeRouter.replace("/welcome");
      return;
    }
    redirected.current = true;
    safeRouter.replace(`/${handle}` as any);
  }, [handle, loading, initialUrlChecked, languageChecked, languageSelected]);

  // Main routing — fires whenever auth state resolves
  useEffect(() => {
    if (!languageChecked || !initialUrlChecked || loading) return;
    if (handle || initialDeepLinkPending) return;
    if (!languageSelected) {
      if (!redirected.current) {
        redirected.current = true;
        safeRouter.replace("/welcome");
      }
      return;
    }
    doRedirect(
      !!session,
      !!profile,
      profile?.onboarding_completed === true,
    );
  }, [session, profile, loading, handle, user?.id, initialUrlChecked, initialDeepLinkPending, languageChecked, languageSelected]);

  // Safety net: if auth takes too long, route based on cached/in-memory state.
  //
  // Extended to 2 500 ms (was 600 ms) so the slow-path (getSession → AsyncStorage
  // backup → SecureStore refresh) has time to complete before we make a routing
  // decision. On a cold start with no MMKV data but a valid SecureStore token the
  // getSession + setSession + TOKEN_REFRESHED round-trip can easily take 1–2 s on
  // a slow network or right after a device reboot.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!languageChecked || !initialUrlChecked) return;
      // If auth already resolved, the main effect owns navigation. The old
      // timer could still redirect just after a slow Android auth restore and
      // replace a valid destination with Welcome/Chats.
      if (redirected.current || !loading || initialDeepLinkPending) return;
      if (!languageSelected) {
        redirected.current = true;
        safeRouter.replace("/welcome");
      } else if (handle) {
        redirected.current = true;
        safeRouter.replace(`/${handle}` as any);
      } else if (getCachedUserId() || user?.id) {
        redirected.current = true;
        safeRouter.replace("/(tabs)/chats");
      } else {
        redirected.current = true;
        const onboardingDone = (() => { try { return storage.getBoolean(KEYS.ONBOARDING_DONE); } catch { return false; } })();
        safeRouter.replace(onboardingDone ? "/(auth)/login" : "/welcome");
      }
    }, 2500);

    return () => clearTimeout(timeout);
  }, [handle, loading, user?.id, initialUrlChecked, initialDeepLinkPending, languageChecked, languageSelected]);

  // This route is only a navigation handoff. Returning users are routed from
  // the synchronous local identity cache, so never show an account-restoring
  // or loading message while background auth work continues.
  return (
    <View style={styles.boot}>
      <ActivityIndicator size="large" color="#FFFFFF" />
      <Text style={styles.bootText}>Starting AfuChat…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "#000000",
  },
  bootText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
});
