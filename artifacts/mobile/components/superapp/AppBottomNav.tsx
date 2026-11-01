import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { usePathname } from "expo-router";
import { safeRouter } from "@/lib/navUtils";
import { FloatingNavSurface, floatingNavigationStyles } from "@/components/ui/FloatingNavSurface";

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
  const { colors, isDark } = useTheme();
  const pathname = usePathname();
  const activeIndex = items.findIndex((item) =>
    item.key === activeKey || (!activeKey && !!item.href && pathname === item.href)
  );
  const selectedIndex = Math.max(0, activeIndex);
  const [barWidth, setBarWidth] = useState(0);
  const activeIndexAnim = useRef(new Animated.Value(selectedIndex)).current;
  const itemWidth = items.length > 0 ? Math.max(0, (barWidth - 12) / items.length) : 0;

  useEffect(() => {
    Animated.spring(activeIndexAnim, {
      toValue: selectedIndex,
      damping: 16,
      stiffness: 280,
      mass: 0.8,
      useNativeDriver: false,
    }).start();
  }, [activeIndexAnim, selectedIndex]);

  const activeTranslateX = items.length > 1
    ? activeIndexAnim.interpolate({
        inputRange: items.map((_, index) => index),
        outputRange: items.map((_, index) => index * itemWidth),
        extrapolate: "clamp",
      })
    : 0;

  return (
    <FloatingNavSurface onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}>
      <Animated.View
        pointerEvents="none"
        style={[
          floatingNavigationStyles.activeHighlight,
          {
            width: itemWidth,
            backgroundColor: colors.navigationActive + (isDark ? "34" : "1C"),
            transform: [{ translateX: activeTranslateX }],
          },
        ]}
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