import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { router, usePathname } from "expo-router";

import { useTheme } from "@/hooks/useTheme";

const PROD_HOST = "https://afuchat.com";

export function DesktopCameraFallback({
  title = "Scan with your phone to continue",
  description = "This step uses your camera. Open AfuChat on your phone and scan the QR code below — we keep cameras off the desktop on purpose.",
  deepLink,
}: {
  title?: string;
  description?: string;
  deepLink?: string;
}) {
  const pathname = usePathname() || "/";
  const { colors, isDark, accent } = useTheme();

  const url = deepLink || `${PROD_HOST}${pathname}`;
  const cardBg = isDark ? "#0E0E10" : "#FFFFFF";
  const border = isDark ? "#1F1F23" : "#E6E7EB";
  const textPrimary = isDark ? "#F2F2F2" : "#1A1A1A";
  const textMuted = isDark ? "#8B8B90" : "#6B6F76";

  return (
    <View style={styles.root}>
      <View
        style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
      >
        <View style={[styles.iconBubble, { backgroundColor: `${accent}1A` }]}>
          <Ionicons name="qr-code-outline" size={26} color={accent} />
        </View>

        <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
        <Text style={[styles.description, { color: textMuted }]}>
          {description}
        </Text>

        <View style={[styles.qrWrap, { borderColor: border }]}>
          <QRCode
            value={url}
            size={200}
            backgroundColor="#FFFFFF"
            color="#0E0E10"
          />
        </View>

        <Text style={[styles.urlLabel, { color: textMuted }]}>{url}</Text>

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)" as any);
            }}
            style={({ hovered }: any) => [
              styles.secondaryBtn,
              { borderColor: border, opacity: hovered ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="arrow-back" size={16} color={textPrimary} />
            <Text style={[styles.secondaryBtnText, { color: textPrimary }]}>
              Go back
            </Text>
          </Pressable>
        </View>

        <View style={[styles.divider, { backgroundColor: border }]} />

        <View style={styles.howRow}>
          <Step n={1} text="Open AfuChat on your phone" muted={textMuted} />
          <Step n={2} text="Tap the camera icon" muted={textMuted} />
          <Step n={3} text="Scan this code" muted={textMuted} />
        </View>
      </View>
    </View>
  );
}

function Step({ n, text, muted }: { n: number; text: string; muted: string }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepBubble, { borderColor: muted }]}>
        <Text style={[styles.stepN, { color: muted }]}>{n}</Text>
      </View>
      <Text style={[styles.stepText, { color: muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 14,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },
  qrWrap: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  urlLabel: {
    fontSize: 11,
    marginBottom: 18,
    fontFamily: "monospace" as any,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "500",
  },
  divider: {
    width: "100%",
    height: 1,
    marginBottom: 16,
  },
  howRow: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepN: {
    fontSize: 11,
    fontWeight: "600",
  },
  stepText: {
    fontSize: 12,
  },
});
