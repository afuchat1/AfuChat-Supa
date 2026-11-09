import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { usePathname } from "expo-router";
import { safeRouter } from "@/lib/navUtils";

export type AppNavItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  href: string;
};

type Props = {
  items: AppNavItem[];
  activeKey?: string;
};

export default function AppBottomNav({ items, activeKey }: Props) {
  const { colors, accent, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // The bar is in normal flow, so adding a synthetic browser safe-area inset
  // pushes every page's bottom content down. Browsers expose no device inset.
  const bottomInset = Platform.OS === "web" ? 0 : insets.bottom;

  return (
    <View style={[styles.rowWrap, { paddingBottom: bottomInset + 8 }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.35 : 0.12,
                shadowRadius: 16,
              },
              android: { elevation: 8 },
              web: {
                boxShadow: isDark
                  ? "0 4px 20px rgba(0,0,0,0.45)"
                  : "0 4px 20px rgba(0,0,0,0.10)",
              } as any,
            }),
          },
        ]}
      >
        {items.map((item) => {
          const active = activeKey === item.key || (!activeKey && pathname === item.href);
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              onPress={() => safeRouter.replace(item.href as any)}
              style={({ pressed }) => [
                styles.item,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <View style={styles.iconWrap}>
                {active && (
                  <View style={[styles.activeIconOval, { backgroundColor: accent }]} />
                )}
                <Ionicons
                  name={item.icon}
                  size={21}
                  color={active ? colors.bubbleText : colors.textMuted}
                />
              </View>
              <Text
                style={[styles.label, { color: active ? accent : colors.textMuted }]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 9,
    paddingHorizontal: 6,
    width: "100%",
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  item: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 44,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  activeIconOval: {
    ...StyleSheet.absoluteFill,
    borderRadius: 9999,
  },
  label: {
    width: "100%",
    fontSize: 9,
    lineHeight: 12,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.2,
    marginTop: 0,
    textAlign: "center",
    includeFontPadding: false,
    textTransform: "uppercase",
  },
});