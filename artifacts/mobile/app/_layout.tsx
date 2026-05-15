import "react-native-gesture-handler";
import { enableScreens } from "react-native-screens";

enableScreens(true);

import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Linking, Platform, StyleSheet, Text, TextInput } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import { handleIncomingUrl } from "@/lib/deepLinkHandler";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppAccentProvider } from "@/context/AppAccentContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AdvancedFeaturesProvider } from "@/context/AdvancedFeaturesContext";
import { ChatPreferencesProvider } from "@/context/ChatPreferencesContext";
import { DataModeProvider } from "@/context/DataModeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ui/ToastContainer";
import AlertModal from "@/components/ui/AlertModal";
import { initConnectivityToasts } from "@/lib/toast";

// Lock out system-level font scaling so the app always renders at its
// intended sizes regardless of the device's accessibility font-size setting.
(Text as any).defaultProps = { ...((Text as any).defaultProps ?? {}), allowFontScaling: false };
(TextInput as any).defaultProps = { ...((TextInput as any).defaultProps ?? {}), allowFontScaling: false };

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = Font.useFonts({
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

  useEffect(() => {
    initConnectivityToasts();
  }, []);

  useEffect(() => {
    // Cold start — app was killed and opened via a link
    Linking.getInitialURL()
      .then(handleIncomingUrl)
      .catch(() => {});

    // Warm start — app already running, link tapped in foreground/background
    const sub = Linking.addEventListener("url", ({ url }) => handleIncomingUrl(url));
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        {/* Translucent status bar — lets content draw edge-to-edge on Android.
            Style is "auto" so it flips between light/dark with the theme. */}
        <StatusBar style="auto" translucent backgroundColor="transparent" />
        <ThemeProvider>
          <AppAccentProvider>
            <DataModeProvider>
              <AuthProvider>
                <LanguageProvider>
                  <AdvancedFeaturesProvider>
                    <ChatPreferencesProvider>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          // Android uses a slide transition; iOS uses the native
                          // push animation. Both feel platform-correct.
                          animation: Platform.OS === "android"
                            ? "slide_from_right"
                            : "ios_from_right",
                          // Transparent so each screen's own background shows —
                          // prevents the cyan flash visible between navigations.
                          contentStyle: { backgroundColor: "transparent" },
                          freezeOnBlur: true,
                        }}
                      >
                        <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
                        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
                        <Stack.Screen name="+not-found" />
                      </Stack>
                      <ToastContainer />
                      <AlertModal />
                    </ChatPreferencesProvider>
                  </AdvancedFeaturesProvider>
                </LanguageProvider>
              </AuthProvider>
            </DataModeProvider>
          </AppAccentProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
