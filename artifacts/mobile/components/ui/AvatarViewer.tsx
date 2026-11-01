import React, { useEffect } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Platform,
  StatusBar,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  uri?: string | null;
  name?: string;
  onClose: () => void;
};

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashColor(name?: string): string {
  const colors = [
    "#FF6B6B","#1018D8","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD",
    "#98D8C8","#F7DC6F","#BB8FCE","#85C1E9","#82E0AA","#F0B27A",
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Full-screen avatar viewer. Tap anywhere outside the image (or hit the close
 * button) to dismiss. Image is sized to the smaller window dimension so it
 * stays square on every aspect ratio (mobile, tablet, desktop preview).
 */
export function AvatarViewer({ visible, uri, name, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = Math.min(width, height) - 48;
  const initials = getInitials(name);
  const fallbackBg = hashColor(name);


  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <Pressable style={[styles.backdrop, { backgroundColor: colors.background }]} onPress={onClose}>
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={12}
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>

        {name ? (
          <View style={[styles.nameWrap, { top: insets.top + 16 }]}>
            <Text style={[styles.nameTxt, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ) : null}

        <Pressable onPress={(e) => e.stopPropagation()}>
          {uri ? (
            <Image
              source={{ uri }}
              style={{
                width: size,
                height: size,
                borderRadius: 16,
                backgroundColor: colors.surface,
              }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={0}
            />
          ) : (
            <View
              style={[
                styles.fallback,
                {
                  width: size,
                  height: size,
                  borderRadius: 16,
                  backgroundColor: fallbackBg,
                },
              ]}
            >
              <Text style={[styles.initials, { fontSize: size * 0.32 }]}>
                {initials}
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  nameWrap: {
    position: "absolute",
    left: 16,
    right: 80,
    zIndex: 1,
  },
  nameTxt: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
});
