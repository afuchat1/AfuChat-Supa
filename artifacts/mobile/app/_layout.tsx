import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import * as Font from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef } from "react";
import { Linking, Platform } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CallManager } from "@/components/CallManager";
import { LanguageProvider } from "@/context/LanguageContext";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { IOSAlert, type IOSAlertButton } from "@/components/ui/IOSAlert";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider, useThemeContext } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabase";
import { registerAlertListener, unregisterAlertListener } from "@/lib/alert";
import { setBaseUrl } from "@/lib/api-client-react/src";
import { migrateOfflineCacheV2toV3 } from "@/lib/videoCache";
import { initDeviceStorage } from "@/lib/storage";
import { AppLockGate } from "@/components/AppLockGate";
import { ChatPreferencesProvider } from "@/context/ChatPreferencesContext";
import { AppAccentProvider } from "@/context/AppAccentContext";
import { AdvancedFeaturesProvider } from "@/context/AdvancedFeaturesContext";
import { DataModeProvider } from "@/context/DataModeContext";
import GoogleOneTap from "@/components/ui/GoogleOneTap";
import CommunityBanner from "@/components/ui/CommunityBanner";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DevViewToolbar } from "@/components/dev/DevViewToolbar";
import { useState } from "react";

function CommunityBannerManager() {
  const { session } = useAuth();
  if (!session?.user?.id) return null;
  return <CommunityBanner userId={session.user.id} />;
}

let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
try {
  KeyboardProvider = require("react-native-keyboard-controller").KeyboardProvider;
} catch (_) {}

try {
  let apiBase = "";
  if (Platform.OS === "web" && typeof window !== "undefined") {
    apiBase = window.location.origin;
  } else {
    const apiUrl = (process.env.EXPO_PUBLIC_API_URL || "").trim();
    const domain = (process.env.EXPO_PUBLIC_DOMAIN || "").trim();
    apiBase = apiUrl ? apiUrl.replace(/\/+$/, "") : domain ? `https://${domain}` : "";
  }
  if (apiBase) setBaseUrl(apiBase);
} catch (_) {}

const queryClient = new QueryClient();

function StatusBarManager() {
  const { isDark } = useThemeContext();
  return <StatusBar style={isDark ? "light" : "dark"} translucent backgroundColor="transparent" />;
}

function ThemeSyncManager() {
  const { user } = useAuth();
  const { themeMode, setThemeMode } = useThemeContext();
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!user) { initialLoadDone.current = false; return; }
    supabase
      .from("advanced_feature_settings")
      .select("theme_mode")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.theme_mode && ["light", "dark", "system"].includes(data.theme_mode)) {
          setThemeMode(data.theme_mode as any);
        }
        initialLoadDone.current = true;
      })
      .then(undefined, () => { initialLoadDone.current = true; });
  }, [user?.id]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    supabase
      .from("advanced_feature_settings")
      .upsert({ user_id: user.id, theme_mode: themeMode }, { onConflict: "user_id" })
      .then(() => {}, () => {});
  }, [themeMode]);

  return null;
}

const bottomSheetAnim = Platform.OS === "web"
  ? { animation: "none" as const }
  : { animation: "slide_from_bottom" as const, gestureDirection: "vertical" as const };

function RootLayoutNav() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === "web" ? "none" : "slide_from_right",
        animationDuration: Platform.OS === "web" ? 0 : 250,
        gestureEnabled: Platform.OS !== "web",
        gestureDirection: "horizontal",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ animation: Platform.OS === "web" ? "none" : "fade" }} />
      <Stack.Screen name="(auth)" options={{ animation: Platform.OS === "web" ? "none" : "fade" }} />
      <Stack.Screen name="(tabs)" options={{ animation: Platform.OS === "web" ? "none" : "fade" }} />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="contact/[id]" />
      <Stack.Screen name="moments/index" options={{ headerShown: false }} />
      <Stack.Screen name="moments/create" options={bottomSheetAnim} />
      <Stack.Screen name="profile/edit" options={bottomSheetAnim} />
      <Stack.Screen name="group/create" options={bottomSheetAnim} />
      <Stack.Screen name="group/[id]" />
      <Stack.Screen name="ai/index" />
      <Stack.Screen name="post/[id]" />
      <Stack.Screen name="my-posts/index" />
      <Stack.Screen name="wallet/index" />
      <Stack.Screen name="gifts/index" />
      <Stack.Screen name="games/index" />
      <Stack.Screen name="games/snake" />
      <Stack.Screen name="games/game-2048" />
      <Stack.Screen name="games/tetris" />
      <Stack.Screen name="games/flappy" />
      <Stack.Screen name="games/space-shooter" />
      <Stack.Screen name="games/brick-breaker" />
      <Stack.Screen name="games/minesweeper" />
      <Stack.Screen name="games/memory-match" />
      <Stack.Screen name="mini-programs/index" />
      <Stack.Screen name="mini-programs/airtime" />
      <Stack.Screen name="mini-programs/data-bundles" />
      <Stack.Screen name="mini-programs/bills" />
      <Stack.Screen name="mini-programs/hotels" />
      <Stack.Screen name="mini-programs/tickets" />
      <Stack.Screen name="mini-programs/transfer" />
      <Stack.Screen name="mini-programs/fee-details" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="stories/camera" options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <Stack.Screen name="stories/create" options={bottomSheetAnim} />
      <Stack.Screen name="stories/view" options={{ animation: "fade" }} />
      <Stack.Screen name="red-envelope/[id]" options={bottomSheetAnim} />
      <Stack.Screen name="settings/index" options={{ headerShown: false }} />
      <Stack.Screen name="settings/offline-videos" options={{ headerShown: false }} />
      <Stack.Screen name="settings/privacy" />
      <Stack.Screen name="settings/notifications" />
      <Stack.Screen name="settings/chat" />
      <Stack.Screen name="settings/blocked" />
      <Stack.Screen name="admin/index" />
      <Stack.Screen name="admin/support-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="support/index" options={{ headerShown: false }} />
      <Stack.Screen name="support/ticket/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding/index" options={{ animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="referral" />
      <Stack.Screen name="qr-scanner" options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <Stack.Screen name="language-settings" />
      <Stack.Screen name="linked-accounts" />
      <Stack.Screen name="terms" options={bottomSheetAnim} />
      <Stack.Screen name="privacy" options={bottomSheetAnim} />
      <Stack.Screen name="video/[id]" options={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "#000" } }} />
      <Stack.Screen name="company/index" />
      <Stack.Screen name="company/[slug]" />
      <Stack.Screen name="company/create" options={bottomSheetAnim} />
      <Stack.Screen name="company/manage" />
      <Stack.Screen name="[handle]" options={{ animation: "fade" }} />
      <Stack.Screen name="call/[id]" options={{ headerShown: false, animation: "fade", gestureEnabled: false, contentStyle: { backgroundColor: "#1a1a2e" } }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [alertState, setAlertState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    buttons?: IOSAlertButton[];
  }>({ visible: false, title: "" });

  const dismissAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    registerAlertListener(setAlertState);
    return () => unregisterAlertListener();
  }, []);

  useEffect(() => {
    // Initialize on-device storage (SQLite DB + MMKV + sync queue) first,
    // then run video cache housekeeping in parallel.
    initDeviceStorage().catch(() => {});
    migrateOfflineCacheV2toV3().catch(() => {});
    // Videos are now stored permanently — no expiry to clear
  }, []);

  useEffect(() => {
    Font.loadAsync({
      Inter_400Regular,
      Inter_500Medium,
      Inter_600SemiBold,
      Inter_700Bold,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    function handleDeepLink(url: string | null) {
      if (!url) return;
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== "afuchat.com" && parsed.hostname !== "www.afuchat.com") return;
        const path = parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
        if (!path || path.includes("/")) return;

        if (path.startsWith("@")) {
          const handle = path.slice(1);
          if (/^[a-zA-Z0-9_]+$/.test(handle)) {
            router.push(`/${path}` as any);
          }
        } else if (/^[a-zA-Z0-9_]+$/.test(path)) {
          router.push(`/${path}` as any);
        }
      } catch (_) {}
    }

    Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ThemeProvider>
                <AppAccentProvider>
                <StatusBarManager />
                <AuthProvider>
                  <ThemeSyncManager />
                  <GoogleOneTap />
                  <CommunityBannerManager />
                  <LanguageProvider>
                    <ChatPreferencesProvider>
                    <AdvancedFeaturesProvider>
                    <DataModeProvider>
                    <PushNotificationManager />
                    <CallManager />
                    <AppLockGate>
                      <DesktopShell>
                        <RootLayoutNav />
                      </DesktopShell>
                    </AppLockGate>
                    <DevViewToolbar />
                    <IOSAlert
                      visible={alertState.visible}
                      title={alertState.title}
                      message={alertState.message}
                      buttons={alertState.buttons}
                      onDismiss={dismissAlert}
                    />
                    </DataModeProvider>
                    </AdvancedFeaturesProvider>
                    </ChatPreferencesProvider>
                  </LanguageProvider>
                </AuthProvider>
              </AppAccentProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
