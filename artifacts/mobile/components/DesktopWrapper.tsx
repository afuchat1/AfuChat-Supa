import React from "react";
import { Platform, View, StyleSheet, Text, Image, useWindowDimensions } from "react-native";

const BRAND = "#00C2CB";
const DESKTOP_BREAKPOINT = 768;
const APP_WIDTH = 420;

type Props = {
  children: React.ReactNode;
};

export function DesktopWrapper({ children }: Props) {
  const { width } = useWindowDimensions();

  if (Platform.OS !== "web" || width < DESKTOP_BREAKPOINT) {
    return <>{children}</>;
  }

  return (
    <View style={styles.outerContainer}>
      <View style={styles.sidebar}>
        <Image
          source={require("@/assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>AfuChat</Text>
        <Text style={styles.tagline}>Connect, Chat, Discover.</Text>
        <View style={styles.featureList}>
          <FeatureItem icon="💬" text="Real-time messaging" />
          <FeatureItem icon="📱" text="Stories & Moments" />
          <FeatureItem icon="💰" text="Nexa & ACoin wallet" />
          <FeatureItem icon="🎁" text="Gifts & Red Envelopes" />
          <FeatureItem icon="🤖" text="AfuAi assistant" />
        </View>
        <Text style={styles.downloadHint}>
          Download the app for the best experience
        </Text>
      </View>

      <View style={[styles.appContainer, { width: APP_WIDTH }]}>
        {children}
      </View>

      <View style={styles.rightPanel} />
    </View>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
  },
  sidebar: {
    flex: 1,
    backgroundColor: BRAND,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    minWidth: 280,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 16,
  },
  brandName: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.9)",
    marginBottom: 40,
  },
  featureList: {
    alignSelf: "stretch",
    maxWidth: 280,
    gap: 16,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    fontSize: 20,
  },
  featureText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.95)",
  },
  downloadHint: {
    marginTop: 48,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
  },
  appContainer: {
    height: "100%",
    backgroundColor: "#fff",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
    // @ts-ignore - web shadow
    boxShadow: "0 0 40px rgba(0,0,0,0.12)",
  },
  rightPanel: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    minWidth: 100,
  },
});
