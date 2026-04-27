import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const QUICK_REACTIONS = ["❤️", "🤝", "👍", "👎", "🔥", "🥰"];

const MENU_W = 232;
const MENU_PAD = 8;

export type MessageMenuAction =
  | "react"
  | "reply"
  | "pin"
  | "copy"
  | "translate"
  | "forward"
  | "edit"
  | "save"
  | "share"
  | "select"
  | "report"
  | "delete";

type Props = {
  x: number;
  y: number;
  isMine: boolean;
  isDark: boolean;
  hasText: boolean;
  onClose: () => void;
  onAction: (action: MessageMenuAction, payload?: any) => void;
};

type Item = {
  key: MessageMenuAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
};

export function MessageContextMenu({
  x,
  y,
  isMine,
  isDark,
  hasText,
  onClose,
  onAction,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const [size, setSize] = useState<{ w: number; h: number }>({ w: MENU_W, h: 360 });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 260,
        friction: 22,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Theme
  const c = isDark
    ? {
        panel: "#1f2c34",
        panelBorder: "rgba(255,255,255,0.07)",
        text: "#e9edef",
        muted: "#8a9ba8",
        hover: "rgba(255,255,255,0.06)",
        divider: "rgba(255,255,255,0.07)",
        danger: "#ff5b5b",
        reactionBg: "#2a3942",
        reactionHover: "#374a55",
      }
    : {
        panel: "#ffffff",
        panelBorder: "rgba(15,20,30,0.10)",
        text: "#111b21",
        muted: "#667781",
        hover: "rgba(15,20,30,0.05)",
        divider: "rgba(15,20,30,0.07)",
        danger: "#e53935",
        reactionBg: "#f4f8fa",
        reactionHover: "#e6eef2",
      };

  const items: Item[] = [
    { key: "reply", label: "Reply", icon: "arrow-undo-outline" },
    { key: "pin", label: "Pin", icon: "pin-outline" },
    ...(hasText ? [{ key: "copy" as const, label: "Copy text", icon: "copy-outline" as const }] : []),
    { key: "translate", label: "Translate", icon: "language-outline" },
    { key: "forward", label: "Forward", icon: "arrow-redo-outline" },
    ...(isMine ? [{ key: "edit" as const, label: "Edit", icon: "create-outline" as const }] : []),
    { key: "save", label: "Save to favorites", icon: "bookmark-outline" },
    { key: "share", label: "Share", icon: "share-social-outline" },
    { key: "select", label: "Select", icon: "checkmark-circle-outline" },
    ...(!isMine ? [{ key: "report" as const, label: "Report", icon: "flag-outline" as const, danger: true }] : []),
    { key: "delete", label: "Delete", icon: "trash-outline", danger: true },
  ];

  // Clamp the menu within viewport (web only — uses window dimensions).
  let posX = x;
  let posY = y;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (posX + size.w + MENU_PAD > vw) posX = Math.max(MENU_PAD, vw - size.w - MENU_PAD);
    if (posY + size.h + MENU_PAD > vh) posY = Math.max(MENU_PAD, vh - size.h - MENU_PAD);
    if (posX < MENU_PAD) posX = MENU_PAD;
    if (posY < MENU_PAD) posY = MENU_PAD;
  }

  return (
    <View
      style={styles.root}
      pointerEvents="box-none"
      // @ts-ignore — RN Web supports onContextMenu
      onContextMenu={(e: any) => e.preventDefault?.()}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        onLayout={(e) =>
          setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
        style={[
          styles.menu,
          {
            left: posX,
            top: posY,
            opacity,
            transform: [{ scale }],
            backgroundColor: c.panel,
            borderColor: c.panelBorder,
            ...(Platform.OS === "web"
              ? ({
                  boxShadow:
                    "0 18px 48px rgba(0,0,0,0.32), 0 4px 14px rgba(0,0,0,0.14)",
                } as any)
              : {}),
          },
        ]}
      >
        {/* Quick reactions row */}
        <View style={[styles.reactionsRow, { borderBottomColor: c.divider }]}>
          {QUICK_REACTIONS.map((emoji) => (
            <ReactionButton
              key={emoji}
              emoji={emoji}
              bg={c.reactionBg}
              hover={c.reactionHover}
              onPress={() => {
                onAction("react", emoji);
                onClose();
              }}
            />
          ))}
          <ReactionButton
            emoji=""
            bg={c.reactionBg}
            hover={c.reactionHover}
            iconName="chevron-down"
            iconColor={c.muted}
            onPress={() => {
              onAction("react", null);
              onClose();
            }}
          />
        </View>

        {/* Action items */}
        <View style={{ paddingVertical: 4 }}>
          {items.map((item) => (
            <MenuItem
              key={item.key}
              label={item.label}
              icon={item.icon}
              danger={item.danger}
              color={item.danger ? c.danger : c.text}
              hover={c.hover}
              onPress={() => {
                onAction(item.key);
                onClose();
              }}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function MenuItem({
  label,
  icon,
  color,
  hover,
  danger,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  hover: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      // @ts-ignore — RN Web hover events
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.menuItem,
        { backgroundColor: hovered ? hover : "transparent" },
      ]}
    >
      <Ionicons name={icon} size={17} color={color} />
      <Text
        style={[
          styles.menuLabel,
          { color, fontFamily: "Inter_500Medium" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ReactionButton({
  emoji,
  bg,
  hover,
  onPress,
  iconName,
  iconColor,
}: {
  emoji: string;
  bg: string;
  hover: string;
  onPress: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      // @ts-ignore — RN Web hover events
      onHoverIn={() => {
        setHovered(true);
        Animated.spring(scale, {
          toValue: 1.18,
          tension: 240,
          friction: 12,
          useNativeDriver: Platform.OS !== "web",
        }).start();
      }}
      onHoverOut={() => {
        setHovered(false);
        Animated.spring(scale, {
          toValue: 1,
          tension: 240,
          friction: 12,
          useNativeDriver: Platform.OS !== "web",
        }).start();
      }}
      style={[
        styles.reactionBtn,
        { backgroundColor: hovered ? hover : bg },
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {iconName ? (
          <Ionicons name={iconName} size={14} color={iconColor || "#888"} />
        ) : (
          <Text style={styles.reactionEmoji}>{emoji}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create<any>({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  menu: {
    position: "absolute",
    width: MENU_W,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 4,
    overflow: "hidden",
  },
  reactionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  reactionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionEmoji: { fontSize: 15, lineHeight: 18 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 12,
  },
  menuLabel: { fontSize: 13.5, letterSpacing: -0.1 },
});
