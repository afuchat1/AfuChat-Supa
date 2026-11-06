import { markStartupPhase, setCrashReporterUserId, setCrashNotificationHandler } from "@/lib/crashReporter";
import "react-native-gesture-handler";
import "@/lib/navigationGuard";
import * as SplashScreen from "expo-splash-screen";

// Keep the native splash visible until we explicitly hide it
SplashScreen.preventAutoHideAsync().catch(() => {});
import { showAlert } from "@/lib/alert";
markStartupPhase("primary");

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppState, BackHandler, I18nManager, Linking, LogBox, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { runAfterIdle } from "@/lib/runAfterIdle";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router, Stack, usePathname, useRootNavigationState } from "expo-router";
import { setCurrentPage, resolvePageInfo } from "@/lib/pageTracker";
import { StatusBar, setStatusBarHidden, setStatusBarStyle } from "expo-status-bar";
import * as Font from "expo-font";
import { useTheme } from "@/hooks/useTheme";
import { refreshAllPermissions } from "@/lib/permissionsManager";

import { handleIncomingUrl } from "@/lib/deepLinkHandler";
import { verifyDeepLinks } from "@/lib/deepLinkVerifier";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

// The offline web preview can leave Expo's font observer pending until its
// 12-second rejection. WebGlobalStyles already provides a system-font fallback,
// so do not start the native font loader on web. Native builds still load the
// bundled Inter files normally.
const APP_FONTS = (
  Platform.OS === "web"
    ? {}
    : {
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
      }
) as Parameters<typeof Font.useFonts>[0];

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CallProvider } from "@/context/CallContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppAccentProvider } from "@/context/AppAccentContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AdvancedFeaturesProvider } from "@/context/AdvancedFeaturesContext";
import { ChatPreferencesProvider } from "@/context/ChatPreferencesContext";
import { DataModeProvider } from "@/context/DataModeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ui/ToastContainer";
import AlertModal from "@/components/ui/AlertModal";
import { GlobalInboxListener } from "@/components/GlobalInboxListener";
import { IncomingCallModal } from "@/components/IncomingCallModal";
import PushNotificationManager from "@/components/PushNotificationManager";
import UpdatePrompt from "@/components/UpdatePrompt";
import { initActivityTracker } from "@/lib/activityTracker";
import { MiniAppRuntimeProvider } from "@/lib/superapp/MiniAppRuntime";
import { GlobalMusicPlayerProvider } from "@/components/GlobalMusicPlayer";
import { AnimationGuardInit } from "@/components/AnimationGuardInit";
import { SplashScreenView } from "@/components/ui/SplashScreenView";
import NativeShareShortcutSync from "@/components/NativeShareShortcutSync";
import DesktopShell from "@/components/web/DesktopShell";
import { safeRouter } from "@/lib/navUtils";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { getNativeShareChatId } from "@/lib/nativeShareShortcuts";

// NOTE: react-native-mmkv has been downgraded to v3 (stable JSI bridge) and
// react-native-nitro-modules has been removed.  v4/Nitro caused an unrecoverable
// native crash on Android standalone builds because the Nitro C++ library had a
// JNI load-order race that no JS try/catch could intercept.  v3 uses the
// traditional synchronous JSI bridge and does not have this problem.
// Conversations pre-warm remains in the useEffect below (not at module-eval time)
// so MMKV is only accessed after the full native runtime is ready.

// Keep Android text line boxes consistent across screens while allowing the
// operating system's accessibility font-size setting to scale app content.
(Text as any).defaultProps = {
  ...((Text as any).defaultProps ?? {}),
  // Android reserves extra top/bottom font space by default. That space is
  // useful for some native text editing scenarios, but it makes icon/text
  // rows appear to have gaps behind their visible glyphs throughout the app.
  includeFontPadding: false,
};
(TextInput as any).defaultProps = {
  ...((TextInput as any).defaultProps ?? {}),
  includeFontPadding: false,
};

// AfuChat uses one consistent left-to-right interface. The selected language
// changes translated copy only; Arabic must not mirror navigation, spacing, or
// the placement of controls across the app.
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

function ActivityTrackerSync() {
  const { user, isAuthenticated } = useAuth();
  useEffect(() => {
    initActivityTracker(isAuthenticated ? user?.id ?? null : null);
  }, [isAuthenticated, user?.id]);
  return null;
}

function CrashReporterUserSync() {
  const { user, isAuthenticated } = useAuth();
  useEffect(() => {
    setCrashReporterUserId(isAuthenticated ? user?.id ?? null : null);
  }, [isAuthenticated, user?.id]);
  return null;
}

/**
 * Registers the crash notification handler so that whenever a crash is
 * captured the user immediately gets the option to report it — either by
 * email or via an in-app support ticket with the error pre-filled as the
 * subject.
 */
function CrashSupportHandler() {
  const { user } = useAuth();

  useEffect(() => {
    setCrashNotificationHandler((errorMessage: string) => {
      // Display label is capped so it fits in the alert body.
      // The full message is still sent to the support ticket.
      const displayMsg = errorMessage.length > 140
        ? errorMessage.slice(0, 137) + "…"
        : errorMessage;

      const encodedSubject = encodeURIComponent(`[AfuChat Bug] ${displayMsg}`);
      const encodedBody = encodeURIComponent(
        `Error details:\n${errorMessage}\n\nSteps to reproduce:\n\nDevice info:\n`,
      );

      showAlert(
        "Unexpected Error",
        `Something went wrong in the app.\n\n"${displayMsg}"\n\nWould you like to send a report so we can fix it?`,
        [
          {
            text: "Open Support Ticket",
            onPress: () => {
              // Small delay so the alert dismisses cleanly before navigation.
              setTimeout(() => {
                safeRouter.push({
                  pathname: "/support" as any,
                  params: {
                    // Pass the full (untruncated) error as the ticket subject.
                    errorSubject: errorMessage,
                    errorCategory: "technical",
                    errorPriority: "high",
                  },
                });
              }, 300);
            },
          },
          {
            text: "Send Email",
            onPress: () => {
              Linking.openURL(
                `mailto:support@afuchat.com?subject=${encodedSubject}&body=${encodedBody}`,
              ).catch(() => {});
            },
          },
          { text: "Dismiss", style: "cancel" },
        ],
      );
    });

    return () => { setCrashNotificationHandler(null); };
  }, [user?.id]);

  return null;
}

function PageWatcher() {
  const pathname = usePathname();
  useEffect(() => {
    setCurrentPage(resolvePageInfo(pathname));
  }, [pathname]);
  return null;
}

/**
 * Make Android Back follow the real navigation stack.
 *
 * The listener stays mounted while the route changes so there is no gap
 * during a transition. Returning false when there is no stack entry is
 * intentional: Android may close the activity only after the user has backed
 * through every page they actually entered.
 */
function HardwareBackGuard() {
  const { session, user } = useAuth();
  const pathname = usePathname();
  const isLoggedIn = Boolean(session?.user?.id || user?.id);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const fallbackRoute = isLoggedIn ? "/(tabs)/chats" : "/(tabs)/discover";
    const isAlreadyAtFallback =
      pathname === fallbackRoute ||
      (isLoggedIn && pathname === "/chats") ||
      (!isLoggedIn && pathname === "/discover");

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // Preserve real navigation history first. Only use the role-appropriate
      // home route when the user has reached the end of the stack.
      if (router.canGoBack()) {
        router.back();
        return true;
      }

      // If already on the fallback destination, allow Android to exit normally.
      if (isAlreadyAtFallback) return false;

      // Public/guest navigation falls back to Feed; authenticated navigation
      // falls back to Chats. No extra navigation button is added to the UI.
      safeRouter.replace(fallbackRoute as any);
      return true;
    });

    return () => subscription.remove();
  }, [isLoggedIn, pathname]);

  return null;
}

// ─── AppNavigationStack ───────────────────────────────────────────────────────
// Reads the theme background so every screen card uses the real background
// colour instead of "transparent" (which causes a white flash on push/pop).
// Use a consistent directional transition globally so every pushed page
// enters from the right and every popped page reverses smoothly.
function AppNavigationStack() {
  const { colors } = useTheme();
  const bg = colors.background;
  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="index"      options={{ animation: "slide_from_right", contentStyle: { backgroundColor: bg } }} />
      <Stack.Screen name="welcome"    options={{ animation: "slide_from_right", gestureEnabled: false }} />
      <Stack.Screen name="(auth)"     options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="(tabs)"     options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="apps"       options={{ animation: "slide_from_right" }} />
      {/* Product surfaces own their internal navigation. Avoid a second native
          slide/gesture on every product tab change, which feels like a bounce. */}
      <Stack.Screen
        name="app/[appId]"
        options={{
          // Mini-apps are full stack pages, never modal cards over the
          // previous screen.
          presentation: "card",
          animation: "slide_from_right",
          gestureEnabled: true,
          contentStyle: { backgroundColor: bg },
        }}
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
  return Platform.OS === "web" ? <DesktopShell>{stack}</DesktopShell> : stack;
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  const pathname = usePathname();
  const statusBarStyle = isDark ? "light" : "dark";
  // The camera composer is intentionally immersive. Every other route owns a
  // visible status bar, so theme changes cannot leave it hidden after a
  // screen-level status bar override.
  const isImmersiveRoute = pathname === "/moments/create-video";

  useEffect(() => {
    if (Platform.OS === "web") return;
    setStatusBarStyle(statusBarStyle, false);
    setStatusBarHidden(isImmersiveRoute, "none");
  }, [isImmersiveRoute, statusBarStyle]);

  return (
    <StatusBar
      style={statusBarStyle}
      hidden={isImmersiveRoute}
      hideTransitionAnimation="none"
      animated
    />
  );
}

function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
      {children}
    </View>
  );
}

function WebGlobalStyles() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const styleId = "afuchat-web-global-layout";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      html, body, #root {
        width: 100%;
        height: 100%;
        margin: 0;
      }
      body {
        overflow: hidden;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        direction: ltr;
        text-align: left;
      }
      *, *::before, *::after {
        box-sizing: border-box;
        direction: ltr;
      }
      button, input, textarea, select {
        font-family: inherit;
      }
      button, input, textarea, select,
      [role="button"], [role="radio"], [role="tab"], [role="link"], [role="textbox"] {
        border: 0 !important;
        box-shadow: none !important;
      }
      button::-moz-focus-inner, input::-moz-focus-inner {
        border: 0;
        padding: 0;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return null;
}

function WebFontGate({
  ready,
  children,
}: {
  ready: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (Platform.OS === "web" && !ready) {
    return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }} />;
  }
  return <>{children}</>;
}

function LanguageDirectionShell({ children }: { children: React.ReactNode }) {
  return <View style={styles.directionShell}>{children}</View>;
}

function IncomingShareGate({ navigationReady }: { navigationReady: boolean }) {
  const { hasShareIntent, isReady, shareIntent } = useShareIntentContext();
  const pathname = usePathname();
  const routedShareRef = useRef("");

  useEffect(() => {
    if (!hasShareIntent) {
      routedShareRef.current = "";
      return;
    }
    if (!isReady || !navigationReady || routedShareRef.current || pathname === "/share") return;

    let cancelled = false;
    void (async () => {
      const signature = [
        shareIntent.type ?? "",
        shareIntent.text ?? "",
        shareIntent.webUrl ?? "",
        ...(shareIntent.files ?? []).map((file) => file.path),
      ].join("|");
      if (!signature || cancelled) return;

      // Android Direct Share carries the selected conversation in the
      // shortcut intent. Read it before routing so the share screen can send
      // to that exact chat without asking the user to pick it again.
      const chatId = await getNativeShareChatId();
      if (cancelled) return;
      routedShareRef.current = signature;
      safeRouter.push(
        chatId
          ? { pathname: "/share", params: { chatId } } as any
          : "/share" as any,
      );
    })();

    return () => { cancelled = true; };
  }, [hasShareIntent, isReady, navigationReady, pathname, shareIntent]);

  return null;
}

/**
 * Keep launcher/widget destinations alive until auth restoration has finished.
 * A cold start can otherwise let app/index.tsx replace a valid chat target
 * with the chats tab before the deep-link event is delivered.
 */
function DeepLinkGate({ navigationReady }: { navigationReady: boolean }) {
  const { session, loading, user } = useAuth();
  const pendingActionRef = useRef<any>(null);
  const [pendingVersion, setPendingVersion] = useState(0);
  const authRef = useRef({ loading, signedIn: Boolean(session?.user?.id || user?.id) });
  authRef.current = { loading, signedIn: Boolean(session?.user?.id || user?.id) };

  const routeAction = useCallback((action: any) => {
    if (action?.type === "join_group") {
      safeRouter.push({ pathname: "/join/[code]", params: { code: action.code } } as any);
      return;
    }
    if (action?.type === "navigate") {
      // A launcher shortcut is an explicit destination. Replace the root
      // handoff rather than pushing it, so app/index.tsx cannot leave the
      // user on Chats after the shortcut has already selected a conversation.
      const route = action.path === "/chat/[id]" ? safeRouter.replace : safeRouter.push;
      if (action.params) {
        route({ pathname: action.path as any, params: action.params });
      } else {
        route(action.path as any);
      }
    }
  }, []);

  useEffect(() => {
    if (!navigationReady) return;
    let cancelled = false;

    const processUrl = async (url: string | null | undefined) => {
      const action = await handleIncomingUrl(url ?? null);
      if (cancelled || !action) return;

      const isChatDestination = action.type === "navigate" && action.path === "/chat/[id]";
      if (isChatDestination && (authRef.current.loading || !authRef.current.signedIn)) {
        pendingActionRef.current = action;
        setPendingVersion((version) => version + 1);
        return;
      }
      routeAction(action);
    };

    // Read the launch URL once. Re-running getInitialURL whenever auth changes
    // can replay a shortcut after the normal root redirect has already fired.
    Linking.getInitialURL().then(processUrl).catch(() => {});
    const subscription = Linking.addEventListener("url", ({ url }) => {
      processUrl(url).catch(() => {});
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [navigationReady, routeAction]);

  useEffect(() => {
    const action = pendingActionRef.current;
    if (!action || loading || (!session?.user?.id && !user?.id)) return;
    pendingActionRef.current = null;
    routeAction(action);
  }, [loading, pendingVersion, routeAction, session?.user?.id, user?.id]);

  return null;
}


export default function RootLayout() {
  const rootNavigationState = useRootNavigationState();
  const [fontsLoaded, fontError] = Font.useFonts(APP_FONTS);
  const [webFontTimeout, setWebFontTimeout] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (!rootNavigationState?.key || (Platform.OS !== "web" && !splashDone)) return;
    markStartupPhase("operational");
  }, [rootNavigationState?.key, splashDone]);

  const handleSplashDone = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
    setSplashDone(true);
  }, []);

  // The visual splash overlay is intentionally native-only. Explicitly hide
  // the platform splash on web as well; otherwise preventAutoHideAsync() above
  // can leave the web preview looking like a blank screen forever.
  useEffect(() => {
    if (Platform.OS === "web") {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

  // If a production bundle cannot load a font asset, do not leave the native
  // splash covering a blank screen forever. System fonts keep layout usable.
  useEffect(() => {
    if (fontError) {
      SplashScreen.hideAsync().catch(() => {});
      setSplashDone(true);
    }
  }, [fontError]);

  // Expo's offline web asset resolver can leave useFonts pending without
  // returning an error. Do not block the entire app in that state; the browser
  // can render the layout with its normal font fallback.
  useEffect(() => {
    if (Platform.OS !== "web" || fontsLoaded || fontError) return;
    const timeout = setTimeout(() => setWebFontTimeout(true), 1500);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  // A broken or unusually slow font/asset load must never leave users behind
  // the native splash forever in a production build. The normal path still
  // waits for fonts and the short fade; this is only a bounded escape hatch.
  useEffect(() => {
    if (Platform.OS === "web" || splashDone) return;
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
      setSplashDone(true);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [splashDone]);

  // Run deep-link route verification once in dev mode to catch any routes
  // that might accidentally fall through to [handle].tsx.
  useEffect(() => {
    if (!__DEV__) return;
    verifyDeepLinks().catch(() => {});
  }, []);

  // Refresh OS permission statuses whenever the app comes back to foreground.
  // The user may have changed a permission (camera, mic, etc.)
  // in iOS/Android Settings while the app was backgrounded.  We re-query and
  // update the MMKV cache so every screen that reads getPermissionStatus() /
  // isPermissionGranted() always sees the current state without a native
  // round-trip at call time.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshAllPermissions().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Drop decoded bitmap cache after the app has been backgrounded for a short
  // time. Keep the disk cache intact so returning to the app can reuse files
  // without holding the image memory cache while Android may reclaim the app.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let trimTimer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (trimTimer) clearTimeout(trimTimer);
        trimTimer = null;
        return;
      }
      if (nextState !== "background") return;
      if (trimTimer) clearTimeout(trimTimer);
      trimTimer = setTimeout(() => {
        trimTimer = null;
        void import("expo-image")
          .then(({ Image }) => Image.clearMemoryCache())
          .catch(() => {});
      }, 3_000);
    });
    return () => {
      if (trimTimer) clearTimeout(trimTimer);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    // Do not compete with the first route for the JS/native bridge. Auth starts
    // sync only after identity restoration, while storage maintenance is delayed
    // until the first screen has had time to settle.
    let storageTimer: ReturnType<typeof setTimeout> | null = null;
    const idleTask = runAfterIdle(() => {
      // Keep maintenance out of the first route's data and interaction window.
      storageTimer = setTimeout(() => {
        if (AppState.currentState !== "active") return;
        // Keep maintenance modules out of the critical startup bundle. These
        // imports are intentionally lazy because storage/index re-exports many
        // SQLite/cache modules.
        import("@/lib/storage")
          .then(({ initDeviceStorage }) => initDeviceStorage())
          .catch(() => undefined);
      }, 4500);
    });

    return () => {
      idleTask.cancel();
      if (storageTimer) clearTimeout(storageTimer);
    };
  }, [rootNavigationState?.key]);


  return (
    <ErrorBoundary FallbackComponent={BootstrapErrorFallback}>
      <ShareIntentProvider options={{ scheme: "afuchat" }}>
        <ErrorBoundary>
        <GestureHandlerRootView style={styles.root}>
          {/* JS splash overlay — visible until fonts load, then fades out */}
          {!splashDone && Platform.OS !== "web" && (
            <SplashScreenView ready={fontsLoaded || !!fontError} onDone={handleSplashDone} />
          )}
          <SafeAreaProvider>
            <ThemeProvider>
              <ThemedRoot>
                <WebGlobalStyles />
                <WebFontGate ready={fontsLoaded || !!fontError || webFontTimeout}>
                  <AppAccentProvider>
                <ThemedStatusBar />
                {/* OOM guard: cancels all animations on app-background / memory-pressure */}
                <AnimationGuardInit />
                <DataModeProvider>
                  <AuthProvider>
                    <CallProvider>
                    <ActivityTrackerSync />
                      <CrashReporterUserSync />
                      <CrashSupportHandler />
                      <PageWatcher />
                       <HardwareBackGuard />
                      <GlobalInboxListener />
                      <PushNotificationManager />
                      <UpdatePrompt />
                      <LanguageProvider>
                        <LanguageDirectionShell>
                          <AdvancedFeaturesProvider>
                            <ChatPreferencesProvider>
                              <MiniAppRuntimeProvider>
                                <GlobalMusicPlayerProvider>
                                 <DeepLinkGate navigationReady={!!rootNavigationState?.key} />
                                <IncomingShareGate navigationReady={!!rootNavigationState?.key} />
                                <NativeShareShortcutSync />
                                <AppNavigationStack />
                                <IncomingCallModal />
                                <ToastContainer />
                                <AlertModal />
                                </GlobalMusicPlayerProvider>
                              </MiniAppRuntimeProvider>
                            </ChatPreferencesProvider>
                          </AdvancedFeaturesProvider>
                        </LanguageDirectionShell>
                      </LanguageProvider>
                    </CallProvider>
                  </AuthProvider>
                </DataModeProvider>
                  </AppAccentProvider>
                </WebFontGate>
              </ThemedRoot>
            </ThemeProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
        </ErrorBoundary>
      </ShareIntentProvider>
    </ErrorBoundary>
  );
}

function BootstrapErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        backgroundColor: "#F5F0E8",
      }}
    >
      <Text style={{ color: "#171717", fontSize: 20, fontWeight: "700" }}>
        AfuChat couldn’t finish starting
      </Text>
      <Text style={{ color: "#555", marginTop: 10 }}>
        {__DEV__ ? error.message : "Restart the app and try again."}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={resetError}
        style={{
          alignSelf: "flex-start",
          marginTop: 20,
          paddingHorizontal: 18,
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: "#1018D8",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  directionShell: { flex: 1, minHeight: 0 },
});
