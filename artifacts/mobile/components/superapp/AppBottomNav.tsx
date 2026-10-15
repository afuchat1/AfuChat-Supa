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
  activeIcon?: React.ComponentProps<typeof Ionicons>["name"];
  href: string;
};

type Props = {
  items: AppNavItem[];
  activeKey?: string;
};

export default function AppBottomNav({ items, activeKey }: Props) {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // The bar is in normal flow, so adding a synthetic browser safe-area inset
  // pushes every page's bottom content down. Browsers expose no device inset.
  const bottomInset = Platform.OS === "web" ? 0 : insets.bottom;

  return (
    <View style={[styles.rowWrap, { paddingBottom: bottomInset + 8 }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
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
                <Ionicons
                  name={active ? (item.activeIcon ?? item.icon) : item.icon}
                  size={active ? 22 : 20}
                  color={active ? accent : colors.textMuted}
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
    alignItems: "stretch",
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 5,
    paddingHorizontal: 8,
    width: "100%",
    minHeight: 62,
    borderTopWidth: 1,
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
    width: 36,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  label: {
    width: "100%",
    fontSize: 10,
    lineHeight: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 1,
    textAlign: "center",
    includeFontPadding: false,
  },
});