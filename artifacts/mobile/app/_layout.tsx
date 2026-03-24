import "react-native-url-polyfill/auto";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { setBaseUrl } from "@workspace/api-client-react";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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
      <Stack.Screen name="mini-programs/index" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="stories/create" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <Stack.Screen name="stories/view" options={{ animation: "fade" }} />
      <Stack.Screen name="red-envelope/[id]" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <Stack.Screen name="settings/privacy" />
      <Stack.Screen name="settings/notifications" />
      <Stack.Screen name="settings/chat" />
      <Stack.Screen name="settings/blocked" />
      <Stack.Screen name="admin/index" />
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ThemeProvider>
                <AuthProvider>
                  <PushNotificationManager />
                  <RootLayoutNav />
                </AuthProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
