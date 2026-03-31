import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

type Props = {
  title: string;
  description?: string;
};

export function ComingSoonView({ title, description }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: Colors.brand + "15" }]}>
          <Ionicons name="hourglass-outline" size={52} color={Colors.brand} />
        </View>
        <View style={[styles.badge, { backgroundColor: Colors.brand + "20" }]}>
          <Text style={[styles.badgeText, { color: Colors.brand }]}>COMING SOON</Text>
        </View>
        <Text style={[styles.headline, { color: colors.text }]}>
          {title} on Web
        </Text>
        <Text style={[styles.subtext, { color: colors.textSecondary }]}>
          {description ||
            `${title} is coming to the web soon. For now, you can access it on the AfuChat mobile app.`}
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={[styles.storeRow]}>
          <View style={[styles.storeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="logo-google-playstore" size={26} color="#01875F" />
            <View>
              <Text style={[styles.storeLabel, { color: colors.textMuted }]}>Get it on</Text>
              <Text style={[styles.storeName, { color: colors.text }]}>Google Play</Text>
            </View>
          </View>
          <View style={[styles.storeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="logo-apple" size={26} color={colors.text} />
            <View>
              <Text style={[styles.storeLabel, { color: colors.textMuted }]}>Download on the</Text>
              <Text style={[styles.storeName, { color: colors.text }]}>App Store</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 14,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  headline: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  divider: {
    width: 48,
    height: 1,
    marginVertical: 4,
  },
  storeRow: {
    gap: 10,
    width: "100%",
    maxWidth: 280,
  },
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  storeLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  storeName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
