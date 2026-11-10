import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Linking } from "react-native";
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
  const knownIdentityRef = useRef(false);
  knownIdentityRef.current = Boolean(getCachedUserId() || user?.id || session?.user?.id);
  const [initialUrlChecked, setInitialUrlChecked] = useState(false);
  const [initialDeepLinkPending, setInitialDeepLinkPending] = useState(false);
  const [languageChecked, setLanguageChecked] = useState(false);
  const [languageSelected, setLanguageSelected] = useState(false);
  const { handle } = useLocalSearchParams<{ handle?: string }>();
  const hasKnownIdentity = Boolean(getCachedUserId() || user?.id || session?.user?.id);

  // Cached returning users go straight to the chat shell instead of waiting
  // for language and initial-URL checks. The root deep-link gate still handles
  // any incoming AfuChat action after navigation is ready.
  useEffect(() => {
    if (!hasKnownIdentity || handle || redirected.current) return;
    redirected.current = true;
    safeRouter.replace(
      profile?.onboarding_completed === false ? "/onboarding" : "/(tabs)/chats",
    );
  }, [hasKnownIdentity, handle, profile?.onboarding_completed]);

  useEffect(() => {
    let mounted = true;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (deepLinkPending: boolean) => {
      if (!mounted || settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      setInitialDeepLinkPending(deepLinkPending);
      setInitialUrlChecked(true);
    };
    // A native Linking bridge can stall during Android startup. The root
    // deep-link gate still owns navigation; this bound only prevents the
    // ordinary index route from remaining blank indefinitely.
    timeout = setTimeout(() => finish(false), 2500);
    Linking.getInitialURL().then(async (url) => {
      if (!mounted || settled) return;
      let deepLinkPending = false;
      if (isAfuChatDeepLink(url)) {
        // Resolve the action only to stop the ordinary boot redirect from
        // racing the root deep-link gate, which owns actual navigation.
        deepLinkPending = !!(await handleIncomingUrl(url));
      }
      finish(deepLinkPending);
    }).catch(() => finish(false));
    return () => {
      mounted = false;
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  // Language is the first-run gate. It runs before auth and onboarding
  // routing so a new user can understand the welcome experience.
  useEffect(() => {
    let mounted = true;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (selected: boolean) => {
      if (!mounted || settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      setLanguageSelected(selected);
      setLanguageChecked(true);
    };
    // If durable preference storage is slow, let returning users reach their
    // cached app shell and send first-run users through the language gate.
    timeout = setTimeout(() => finish(knownIdentityRef.current), 2500);
    AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY)
      .then((stored) => {
        finish(!!stored && stored !== "none");
      })
      .catch(() => finish(knownIdentityRef.current));
    return () => {
      mounted = false;
      if (timeout) clearTimeout(timeout);
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

  // This route is only a navigation handoff. Keep it visually empty while
  // the redirect effects resolve; never show a branded loader or block the
  // destination with a separate loading screen.
  return null;
}
