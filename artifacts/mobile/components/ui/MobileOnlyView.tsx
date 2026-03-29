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

export function MobileOnlyView({ title, description }: Props) {
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
          <Ionicons name="phone-portrait-outline" size={52} color={Colors.brand} />
        </View>
        <Text style={[styles.headline, { color: colors.text }]}>
          Mobile App Required
        </Text>
        <Text style={[styles.subtext, { color: colors.textSecondary }]}>
          {description ||
            `${title} is only available on the AfuChat mobile app. Download it from the Play Store or App Store to access this feature.`}
        </Text>
        <View style={[styles.storeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="logo-google-playstore" size={28} color="#01875F" />
          <View>
            <Text style={[styles.storeLabel, { color: colors.textMuted }]}>Get it on</Text>
            <Text style={[styles.storeName, { color: colors.text }]}>Google Play</Text>
          </View>
        </View>
        <View style={[styles.storeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="logo-apple" size={28} color={colors.text} />
          <View>
            <Text style={[styles.storeLabel, { color: colors.textMuted }]}>Download on the</Text>
            <Text style={[styles.storeName, { color: colors.text }]}>App Store</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
    gap: 16,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
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
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    width: "100%",
    maxWidth: 260,
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
