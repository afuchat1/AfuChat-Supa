import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { usePathname } from "expo-router";
import { safeRouter } from "@/lib/navUtils";
import {
  FloatingNavIndicator,
  FloatingNavSurface,
  floatingNavigationStyles,
} from "@/components/ui/FloatingNavSurface";

export type AppNavItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon?: React.ComponentProps<typeof Ionicons>["name"];
  href?: string;
  onPress?: () => void;
  testID?: string;
};

type Props = {
  items: AppNavItem[];
  activeKey?: string;
};

export default function AppBottomNav({ items, activeKey }: Props) {
  const { colors } = useTheme();
  const pathname = usePathname();
  const activeIndex = items.findIndex((item) =>
    item.key === activeKey || (!activeKey && !!item.href && pathname === item.href)
  );
  const selectedIndex = Math.max(0, activeIndex);
  const [barWidth, setBarWidth] = useState(0);

  return (
    <FloatingNavSurface onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}>
      <FloatingNavIndicator
        itemCount={items.length}
        selectedIndex={selectedIndex}
        barWidth={barWidth}
      />
      {items.map((item, index) => {
        const active = selectedIndex === index && activeIndex >= 0;
        return (
          <Pressable
            key={item.key}
            testID={item.testID ?? `app-nav-${item.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => {
              if (item.onPress) item.onPress();
              else if (item.href) safeRouter.replace(item.href as any);
            }}
            style={({ pressed }) => [
              floatingNavigationStyles.item,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={floatingNavigationStyles.iconWrap}>
              <Ionicons
                name={active ? (item.activeIcon ?? item.icon) : item.icon}
                size={22}
                color={active ? colors.navigationActive : colors.navigationInactive}
              />
            </View>
            <Text
              style={[
                floatingNavigationStyles.label,
                { color: active ? colors.navigationActive : colors.navigationInactive },
              ]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </FloatingNavSurface>
  );
}