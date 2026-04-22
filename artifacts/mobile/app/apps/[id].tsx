import React, { useMemo } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

let WebView: any = null;
if (Platform.OS !== "web") {
  const wv = require("react-native-webview");
  WebView = wv.WebView;
}

const APPS: Record<string, { title: string; url: string }> = {
  email: { title: "AfuChat Mail", url: "https://email.afuchat.com" },
  ajs: { title: "AJS Digital Services", url: "https://ajsdigitalservices.com/" },
};

export default function EmbeddedAppScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const app = useMemo(() => (id ? APPS[String(id).toLowerCase()] : undefined), [id]);

  if (!app) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: colors.text, fontSize: 16, marginBottom: 12 }}>App not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.primary }]}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {app.title}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {Platform.OS === "web" ? (
        <iframe
          src={app.url}
          title={app.title}
          style={{ flex: 1, width: "100%", height: "100%", border: "none" } as any}
          allow="clipboard-read; clipboard-write; fullscreen; camera; microphone; geolocation"
        />
      ) : WebView ? (
        <WebView
          source={{ uri: app.url }}
          style={{ flex: 1 }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
        />
      ) : (
        <View style={styles.center}>
          <Text style={{ color: colors.text }}>Unable to load embedded view.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 16, fontWeight: "600", textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
});
