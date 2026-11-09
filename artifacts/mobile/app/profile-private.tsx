/**
 * profile-private.tsx
 * Shown when the visited user has a private account and the viewer
 * does not (yet) follow them.
 *
 * Exported two ways:
 *  • default export      → standalone route (reads params from URL)
 *  • ProfilePrivateView  → inline component (accepts explicit props)
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type PrivateViewProps = {
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
  profileId?: string;
  onBack?: () => void;
};

// ─── Shared view ──────────────────────────────────────────────────────────────

export function ProfilePrivateView({
  handle,
  displayName,
  avatarUrl,
  profileId,
  onBack,
}: PrivateViewProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(false);

  const name = displayName || handle || "";
  const initials = name
    .split(" ")
    .map((w: string) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
  const hue = name ? name.charCodeAt(0) * 37 % 360 : 200;

  function goBack() {
    if (onBack) { onBack(); return; }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/discover" as any);
    }
  }

  async function handleFollow() {
    if (!user || !profileId || followed) return;
    setLoading(true);
    setFollowed(true);
    await supabase
      .from("follows")
      .upsert(
        { follower_id: user.id, following_id: profileId },
        { onConflict: "follower_id,following_id" }
      );
    setLoading(false);
    if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any);
  }

  return (
    <View style={[styles.body, { backgroundColor: colors.background }]}>
      {/* Avatar with lock badge */}
      <View style={styles.avatarWrap}>
        {avatarUrl ? (
          <ExpoImage
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: `hsl(${hue},55%,52%)` }]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={[styles.lockBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="lock-closed" size={15} color={colors.text} />
        </View>
      </View>

      <Text style={[styles.title, { color: colors.text }]}>
        {displayName
          ? `${displayName}'s account is private`
          : handle
          ? `@${handle}'s account is private`
          : "This account is private"}
      </Text>

      {handle && (
        <Text style={[styles.handleText, { color: colors.textMuted }]}>@{handle}</Text>
      )}

      <Text style={[styles.sub, { color: colors.textMuted }]}>
        Follow this account to see their posts, photos, and videos.
      </Text>

      {user && profileId ? (
        <TouchableOpacity
          style={[
            styles.btn,
            {
              backgroundColor: followed ? colors.surface : colors.accent,
              borderColor: followed ? colors.border : colors.accent,
            },
          ]}
          onPress={handleFollow}
          disabled={followed || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={followed ? colors.textMuted : "#fff"} />
          ) : (
            <>
              <Ionicons
                name={followed ? "checkmark" : "person-add"}
                size={16}
                color={followed ? colors.textMuted : "#fff"}
              />
              <Text style={[styles.btnText, { color: followed ? colors.textMuted : "#fff" }]}>
                {followed ? "Requested" : "Follow"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : !user ? (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
          onPress={() => router.push("/(auth)/login" as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="log-in" size={16} color="#fff" />
          <Text style={[styles.btnText, { color: "#fff" }]}>Sign in to Follow</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.btnOutline, { borderColor: colors.border }]}
        onPress={goBack}
        activeOpacity={0.85}
      >
        <Text style={[styles.btnOutlineText, { color: colors.text }]}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Standalone page ───────────────────────────────────────────────────────────

export default function ProfilePrivateScreen() {
  const params = useLocalSearchParams<{
    handle?: string;
    display_name?: string;
    id?: string;
    avatar_url?: string;
  }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)/discover" as any);
            }
          }}
          hitSlop={{ top: 8, left: 8, right: 12, bottom: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        {params.display_name ? (
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {params.display_name}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={styles.headerSide} />
      </View>
      <ProfilePrivateView
        handle={params.handle}
        displayName={params.display_name}
        avatarUrl={params.avatar_url}
        profileId={params.id}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  headerSide: { width: 40 },

  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    paddingBottom: 80,
  },
  avatarWrap: { position: "relative", marginBottom: 8 },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  avatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  lockBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },

  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  handleText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  sub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 2,
  },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: "stretch",
    borderWidth: 1.5,
  },
  btnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  btnOutline: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "stretch",
  },
  btnOutlineText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
