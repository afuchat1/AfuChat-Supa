/**
 * GlassHeader — a liquid glass navigation bar for every settings/detail screen.
 *
 * Drop-in replacement for the custom `View` headers used across the app.
 * Automatically uses safe area top inset, BlurView on iOS, and provides
 * consistent back button, title, and optional right-side action slot.
 */
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { GLASS, glassTokens } from "@/constants/glass";
import { useTheme } from "@/hooks/useTheme";

// ─── Props ────────────────────────────────────────────────────────────────────
export interface GlassHeaderProps {
  title: string;
  onBack?: () => void;
  /** Pass false to hide the back button entirely */
  showBack?: boolean;
  /** Optional element(s) rendered in the right slot */
  right?: React.ReactNode;
  /** Custom container style */
  style?: ViewStyle;
  /** Extra padding below the header content */
  extraBottom?: number;
  /** Subtitle rendered below the title */
  subtitle?: string;
  /** Force large title style (like iOS) */
  largeTitle?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function GlassHeader({
  title,
  onBack,
  showBack = true,
  right,
  style,
  extraBottom = 0,
  subtitle,
  largeTitle = false,
}: GlassHeaderProps) {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const g = glassTokens(isDark);

  const paddingTop = insets.top + (largeTitle ? 6 : 8);
  const paddingBottom = 12 + extraBottom;

  function handleBack() {
    if (onBack) { onBack(); return; }
    if (router.canGoBack()) router.back();
  }

  const content = (
    <View
      style={[
        styles.inner,
        { paddingTop, paddingBottom },
        largeTitle && styles.innerLarge,
      ]}
    >
      {/* Left: back button */}
      <View style={styles.side}>
        {showBack && (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backBtn}
            hitSlop={{ top: 10, left: 10, right: 14, bottom: 10 }}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* Center: title */}
      <View style={styles.center}>
        {largeTitle ? (
          <Text style={[styles.largeTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* Right slot */}
      <View style={[styles.side, styles.sideRight]}>
        {right ?? <View style={styles.backBtn} />}
      </View>
    </View>
  );

  // ── iOS: blur behind ────────────────────────────────────────────────────
  if (Platform.OS === "ios") {
    return (
      <View style={[styles.container, style]}>
        <BlurView
          intensity={GLASS.blur.heavy}
          tint={g.blurTint}
          style={StyleSheet.absoluteFill}
        />
        {/* Fill tint */}
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: g.fill }]}
          pointerEvents="none"
        />
        {/* Specular top edge */}
        <LinearGradient
          colors={g.specular}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {content}
        {/* Bottom hairline */}
        <View
          style={[styles.border, { backgroundColor: g.border }]}
          pointerEvents="none"
        />
      </View>
    );
  }

  // ── Android / Web ──────────────────────────────────────────────────────
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: g.fill,
          ...(Platform.OS === "web"
            ? ({ backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" } as any)
            : {}),
        },
        style,
      ]}
    >
      <LinearGradient
        colors={g.specular}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {content}
      <View style={[styles.border, { backgroundColor: g.border }]} pointerEvents="none" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 10,
  },
  inner: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
  },
  innerLarge: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
  },
  side: {
    width: 50,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  center: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 2,
  },
  backBtn: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  largeTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    alignSelf: "flex-start",
  },
  border: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
