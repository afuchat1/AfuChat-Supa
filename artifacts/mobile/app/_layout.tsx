import "react-native-gesture-handler";
import { enableScreens } from "react-native-screens";

enableScreens(true);

import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
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
import { initConnectivityToasts } from "@/lib/toast";

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

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
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
                          animation: "ios_from_right",
                          contentStyle: { backgroundColor: "#00BCD4" },
                          freezeOnBlur: true,
                        }}
                      >
                        <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
                        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
                        <Stack.Screen name="+not-found" />
                      </Stack>
                      <ToastContainer />
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
