import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DesktopWrapper } from "@/components/DesktopWrapper";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LanguageProvider } from "@/context/LanguageContext";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { IOSAlert, type IOSAlertButton } from "@/components/ui/IOSAlert";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider, useThemeContext } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabase";
import { registerAlertListener, unregisterAlertListener } from "@/lib/alert";
import { setBaseUrl } from "@/lib/api-client-react/src";

try { setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`); } catch (_) {}

SplashScreen.preventAutoHideAsync();

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
      .catch(() => { initialLoadDone.current = true; });
  }, [user?.id]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    supabase
      .from("advanced_feature_settings")
      .upsert({ user_id: user.id, theme_mode: themeMode }, { onConflict: "user_id" })
      .then(() => {})
      .catch(() => {});
  }, [themeMode]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: 250,
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    >
      <Stack.Screen name="index" options={{ animation: "fade" }} />
      <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="contact/[id]" />
      <Stack.Screen name="moments/create" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <Stack.Screen name="profile/edit" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <Stack.Screen name="group/create" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
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
      <Stack.Screen name="stories/create" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <Stack.Screen name="stories/view" options={{ animation: "fade" }} />
      <Stack.Screen name="red-envelope/[id]" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <Stack.Screen name="settings/privacy" />
      <Stack.Screen name="settings/notifications" />
      <Stack.Screen name="settings/chat" />
      <Stack.Screen name="settings/blocked" />
      <Stack.Screen name="admin/index" />
      <Stack.Screen name="onboarding/index" options={{ animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="referral" />
      <Stack.Screen name="language-settings" />
      <Stack.Screen name="linked-accounts" />
      <Stack.Screen name="terms" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <Stack.Screen name="privacy" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <Stack.Screen name="[handle]" options={{ animation: "fade" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

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

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <DesktopWrapper>
                <ThemeProvider>
                  <StatusBarManager />
                  <AuthProvider>
                    <ThemeSyncManager />
                    <LanguageProvider>
                      <PushNotificationManager />
                      <RootLayoutNav />
                      <IOSAlert
                        visible={alertState.visible}
                        title={alertState.title}
                        message={alertState.message}
                        buttons={alertState.buttons}
                        onDismiss={dismissAlert}
                      />
                    </LanguageProvider>
                  </AuthProvider>
                </ThemeProvider>
              </DesktopWrapper>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
