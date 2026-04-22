import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

let WebView: any = null;
if (Platform.OS !== "web") {
  const wv = require("react-native-webview");
  WebView = wv.WebView;
}

type MiniApp = {
  slug: string;
  name: string;
  app_url: string;
  privacy_url: string;
  terms_url: string;
  github_url: string;
  icon_url?: string | null;
  builtin?: boolean;
};

// Built-in, first-party apps (always available, never need DB)
const BUILTIN: Record<string, MiniApp> = {
  email: {
    slug: "email",
    name: "AfuChat Mail",
    app_url: "https://email.afuchat.com",
    privacy_url: "https://afuchat.com/privacy",
    terms_url: "https://afuchat.com/terms",
    github_url: "https://github.com/afuchat",
    builtin: true,
  },
  ajs: {
    slug: "ajs",
    name: "AJS Digital Services",
    app_url: "https://ajsdigitalservices.com/",
    privacy_url: "https://ajsdigitalservices.com/privacy",
    terms_url: "https://ajsdigitalservices.com/terms",
    github_url: "https://github.com/afuchat",
    builtin: true,
  },
};

export default function EmbeddedAppScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const slug = useMemo(() => (id ? String(id).toLowerCase() : ""), [id]);

  const [app, setApp] = useState<MiniApp | null>(slug && BUILTIN[slug] ? BUILTIN[slug] : null);
  const [loading, setLoading] = useState(!BUILTIN[slug]);
  const [notFound, setNotFound] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!slug || BUILTIN[slug]) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    supabase
      .from("mini_apps")
      .select("slug,name,app_url,privacy_url,terms_url,github_url,icon_url,status")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.status !== "approved") {
          setApp(null);
          setNotFound(true);
        } else {
          setApp(data as MiniApp);
          supabase.rpc("bump_mini_app_open", { p_slug: slug }).then(() => {}, () => {});
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (notFound || !app) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="apps-outline" size={56} color={colors.textMuted} />
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600", marginTop: 14 }}>
          Mini app not found
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 6, textAlign: "center", paddingHorizontal: 32 }}>
          The app "{slug}" doesn't exist or hasn't been approved yet.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/apps" as any)}
          style={[styles.backBtn, { backgroundColor: colors.accent, marginTop: 20 }]}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Browse apps</Text>
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
          {app.name}
        </Text>
        <TouchableOpacity onPress={() => setShowInfo(true)} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="information-circle-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {Platform.OS === "web" ? (
        <iframe
          src={app.app_url}
          title={app.name}
          style={{ flex: 1, width: "100%", height: "100%", border: "none" } as any}
          allow="clipboard-read; clipboard-write; fullscreen; camera; microphone; geolocation"
        />
      ) : WebView ? (
        <WebView
          source={{ uri: app.app_url }}
          style={{ flex: 1 }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          )}
        />
      ) : (
        <View style={styles.center}>
          <Text style={{ color: colors.text }}>Unable to load embedded view.</Text>
        </View>
      )}

      <Modal visible={showInfo} transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowInfo(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{app.name}</Text>
              <TouchableOpacity onPress={() => setShowInfo(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <InfoRow icon="shield-checkmark-outline" label="Privacy Policy" url={app.privacy_url} colors={colors} />
            <InfoRow icon="document-text-outline" label="Terms of Service" url={app.terms_url} colors={colors} />
            <InfoRow icon="logo-github" label="Source on GitHub" url={app.github_url} colors={colors} />
            <InfoRow icon="link-outline" label="Open in browser" url={app.app_url} colors={colors} />

            {app.builtin ? (
              <Text style={[styles.modalFootnote, { color: colors.textMuted }]}>Built-in app by AfuChat.</Text>
            ) : (
              <Text style={[styles.modalFootnote, { color: colors.textMuted }]}>
                This is a third-party mini app. AfuChat is not responsible for its content.
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  url,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  url: string;
  colors: any;
}) {
  return (
    <TouchableOpacity
      style={[styles.infoRow, { borderTopColor: colors.border }]}
      onPress={() => Linking.openURL(url).catch(() => {})}
      activeOpacity={0.6}
    >
      <Ionicons name={icon} size={20} color={colors.accent} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
          {url}
        </Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.textMuted} />
    </TouchableOpacity>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 28,
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalFootnote: {
    fontSize: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    textAlign: "center",
  },
});
