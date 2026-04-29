import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";

export type ContextMenuItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type ContextMenuSection = ContextMenuItem[];

type Position = { x: number; y: number };

type Props = {
  position: Position | null;
  sections: ContextMenuSection[];
  onClose: () => void;
};

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 34;

/**
 * Floating right-click menu, web-only. Renders nothing on native, where the
 * platform doesn't have a right-click concept (long-press menus are handled
 * separately).
 *
 * Place a single instance per screen and update `position` from any
 * onContextMenu handler. Use `useContextMenu` for the most common pattern.
 */
export function ContextMenu({ position, sections, onClose }: Props) {
  const { isDark } = useTheme();
  const containerRef = useRef<View | null>(null);

  // Close on outside click, escape key, scroll, or window resize.
  useEffect(() => {
    if (!position || Platform.OS !== "web") return;
    const onMouseDown = (e: MouseEvent) => {
      const node: any = containerRef.current as any;
      if (node && node.contains && node.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScrollOrResize = () => onClose();
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [position, onClose]);

  const adjusted = useMemo<Position | null>(() => {
    if (!position || Platform.OS !== "web") return null;
    const total =
      sections.reduce((sum, s) => sum + s.length, 0) * ITEM_HEIGHT +
      sections.length * 8 +
      12;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = Math.min(position.x, w - MENU_WIDTH - 8);
    const y = Math.min(position.y, h - total - 8);
    return { x: Math.max(8, x), y: Math.max(8, y) };
  }, [position, sections]);

  if (!adjusted || Platform.OS !== "web") return null;

  const bg = isDark ? "#16161A" : "#FFFFFF";
  const border = isDark ? "#26262B" : "#E6E7EB";
  const hover = isDark ? "#1F2024" : "#F2F4F7";
  const text = isDark ? "#F2F2F2" : "#1A1A1A";
  const muted = isDark ? "#5A5A60" : "#9AA0A8";
  const danger = "#EF4444";

  return (
    <View
      ref={containerRef as any}
      style={[
        styles.menu,
        {
          left: adjusted.x,
          top: adjusted.y,
          backgroundColor: bg,
          borderColor: border,
        },
      ]}
    >
      {sections.map((section, sIdx) => (
        <View key={sIdx}>
          {sIdx > 0 ? (
            <View style={[styles.divider, { backgroundColor: border }]} />
          ) : null}
          {section.map((item) => {
            const color = item.disabled
              ? muted
              : item.destructive
                ? danger
                : text;
            return (
              <Pressable
                key={item.key}
                disabled={item.disabled}
                onPress={() => {
                  onClose();
                  item.onSelect();
                }}
                style={({ hovered }: any) => [
                  styles.item,
                  {
                    backgroundColor:
                      hovered && !item.disabled ? hover : "transparent",
                  },
                ]}
              >
                {item.icon ? (
                  <Ionicons name={item.icon} size={15} color={color} />
                ) : (
                  <View style={{ width: 15 }} />
                )}
                <Text style={[styles.itemText, { color }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Convenience hook for the common pattern: show a menu at the cursor on
 * right-click, hide on close. Returns:
 *   - `bind` — props to spread on the parent web element (only adds
 *      `onContextMenu`; on native this is a no-op).
 *   - `menuProps` — pass directly into <ContextMenu …menuProps />.
 */
export function useContextMenu(sections: ContextMenuSection[]) {
  const [pos, setPos] = useState<Position | null>(null);

  const bind = useMemo(() => {
    if (Platform.OS !== "web") return {} as any;
    return {
      onContextMenu: (e: any) => {
        e.preventDefault?.();
        e.stopPropagation?.();
        setPos({ x: e.clientX, y: e.clientY });
      },
    };
  }, []);

  return {
    bind,
    menuProps: {
      position: pos,
      sections,
      onClose: () => setPos(null),
    },
  };
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    width: MENU_WIDTH,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 6,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    // @ts-expect-error react-native-web supports this
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    height: ITEM_HEIGHT,
  },
  itemText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
});
