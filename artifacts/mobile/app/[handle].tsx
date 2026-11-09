/**
 * Catch-all route for /@username and /username.
 *
 * Every valid handle resolves to the canonical profile or public chat screen.
 * This route is intentionally only a resolver: it shows a skeleton while the
 * exact target is checked, then replaces itself with that target.
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Platform, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ContactProfileSkeleton } from "@/components/ui/Skeleton";
import { logHandleLeak } from "@/lib/deepLinkVerifier";
import * as Haptics from "@/lib/haptics";

function safeNavigate(path: string, params?: Record<string, string>) {
  try {
    if (params) router.replace({ pathname: path as any, params });
    else router.replace(path as any);
  } catch {}
}

const RESERVED_ROUTES = new Set([
  "browser", "onboarding", "welcome", "settings", "wallet", "shop", "chat",
  "discover", "video", "shorts", "moments", "match", "games", "ai", "support",
  "company", "freelance", "article", "channel", "group", "join", "my-posts",
  "profile", "post", "stories", "red-envelope", "mini-programs", "gifts", "p",
  "update-password", "contact", "cart", "orders", "product", "index", "logout",
  "register", "login", "reset-password", "404", "not-found", "about", "lab",
  "achievements", "watch-history", "prestige", "store", "premium", "status",
  "digital-id", "qr-scanner", "create-post", "followers", "saved-posts",
  "collections", "language-settings", "device-security",
  "phone-contacts", "user-discovery", "username-market", "digital-events",
  "file-manager", "business", "business-verification", "paid-communities", "help",
]);

type ResolvedTarget =
  | { kind: "profile"; id: string }
  | {
      kind: "channel";
      id: string;
      name: string;
      avatarUrl: string | null;
      handle: string;
      description: string | null;
    }
  | {
      kind: "group";
      id: string;
      name: string;
      handle: string;
    };

export default function HandleScreen() {
  const { handle: rawHandle } = useLocalSearchParams<{ handle: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigationState = useRootNavigationState();
  const hasNavigated = useRef(false);
  const deniedHandleRef = useRef<string | null>(null);
  const denyShake = useRef(new Animated.Value(0)).current;
  const [target, setTarget] = useState<ResolvedTarget | null>(null);
  const [targetNotFound, setTargetNotFound] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const cleanHandle = (rawHandle || "").replace(/^@/, "").toLowerCase();
  const isValidHandle =
    /^[a-zA-Z0-9_]{1,30}$/.test(cleanHandle) &&
    !RESERVED_ROUTES.has(cleanHandle);

  useEffect(() => {
    hasNavigated.current = false;
    deniedHandleRef.current = null;
    denyShake.setValue(0);
  }, [cleanHandle, denyShake]);

  useEffect(() => {
    if (!cleanHandle || !RESERVED_ROUTES.has(cleanHandle)) return;
    logHandleLeak(cleanHandle, "reserved app route reached [handle].tsx");
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      safeNavigate(session ? "/(tabs)/discover" : "/welcome");
    }
  }, [cleanHandle, session]);

  useEffect(() => {
    if (!isValidHandle) {
      setDataReady(true);
      return;
    }

    let cancelled = false;
    setDataReady(false);
    setTarget(null);
    setTargetNotFound(false);

    async function resolve() {
      // Public chat usernames are reserved across profiles, channels, and
      // groups. Resolve each public source before allowing any navigation so
      // a chat username can never fall through to a profile error screen.
      const [
        { data: profiles, error: profileError },
        { data: channels, error: channelError },
        { data: groups, error: groupError },
        { data: aliases, error: aliasError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id")
          .ilike("handle", cleanHandle)
          .limit(1),
        supabase
          .from("channels")
          .select("id, name, handle, description, avatar_url, is_public")
          .ilike("handle", cleanHandle)
          .eq("is_public", true)
          .limit(1),
        supabase
          .from("chats")
          .select("id, name, handle, is_group, is_channel")
          .ilike("handle", cleanHandle)
          .eq("is_group", true)
          .eq("is_channel", false)
          .limit(1),
        supabase
          .from("owned_usernames")
          .select("owner_id")
          .ilike("handle", cleanHandle)
          .limit(1),
      ]);

      if (cancelled) return;
      const queryError = profileError || channelError || groupError || aliasError;
      if (queryError) {
        console.warn("[HandleScreen] username lookup failed:", queryError.message);
        throw queryError;
      }

      const primary = (profiles as any[] | null)?.[0];
      if (primary?.id) {
        setTarget({ kind: "profile", id: primary.id });
        setDataReady(true);
        return;
      }

      const channel = (channels as any[] | null)?.[0];
      if (channel?.id) {
        setTarget({
          kind: "channel",
          id: channel.id,
          name: channel.name || "Channel",
          avatarUrl: channel.avatar_url || null,
          handle: channel.handle || cleanHandle,
          description: channel.description || null,
        });
        setDataReady(true);
        return;
      }

      const group = (groups as any[] | null)?.[0];
      if (group?.id) {
        setTarget({
          kind: "group",
          id: group.id,
          name: group.name || "Group",
          handle: group.handle || cleanHandle,
        });
        setDataReady(true);
        return;
      }

      const alias = (aliases as any[] | null)?.[0];
      if (alias?.owner_id) {
        // An owned username can outlive a deleted profile. Confirm the owner
        // still has a profile before treating the alias as navigable.
        const { data: aliasProfile, error: aliasProfileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", alias.owner_id)
          .maybeSingle();

        if (aliasProfileError) {
          console.warn("[HandleScreen] owner lookup failed:", aliasProfileError.message);
          throw aliasProfileError;
        }
        if (cancelled) return;
        if (aliasProfile?.id) {
          setTarget({ kind: "profile", id: aliasProfile.id });
          setDataReady(true);
          return;
        }
      }

      setTargetNotFound(true);
      setDataReady(true);
    }

    resolve().catch(() => {
      if (!cancelled) {
        setTargetNotFound(true);
        setDataReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cleanHandle, isValidHandle]);

  useEffect(() => {
    const denied = dataReady && (targetNotFound || !isValidHandle || !target);
    if (!denied || hasNavigated.current || deniedHandleRef.current === cleanHandle) return;

    deniedHandleRef.current = cleanHandle;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    denyShake.setValue(0);
    Animated.sequence([
      Animated.timing(denyShake, { toValue: 9, duration: 55, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(denyShake, { toValue: -9, duration: 55, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(denyShake, { toValue: 6, duration: 45, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(denyShake, { toValue: -6, duration: 45, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(denyShake, { toValue: 0, duration: 55, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, [cleanHandle, dataReady, denyShake, isValidHandle, target, targetNotFound]);

  useEffect(() => {
    if (hasNavigated.current || !dataReady || !navigationState?.key) return;
    if (RESERVED_ROUTES.has(cleanHandle)) return;
    if (targetNotFound || !isValidHandle || !target) return;

    hasNavigated.current = true;
    if (target.kind === "profile") {
      safeNavigate("/contact/[id]", { id: target.id });
    } else if (target.kind === "channel") {
      safeNavigate("/channel/[id]", {
        id: target.id,
        isChannel: "true",
        chatName: target.name,
        chatAvatar: target.avatarUrl || "",
        channelHandle: target.handle,
        channelDescription: target.description || "",
      });
    } else {
      safeNavigate("/chat/[id]", {
        id: target.id,
        chatName: target.name,
        chatHandle: target.handle,
        isGroup: "true",
        isChannel: "false",
      });
    }
  }, [
    cleanHandle,
    dataReady,
    isValidHandle,
    navigationState?.key,
    target,
    targetNotFound,
  ]);

  if (!dataReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ContactProfileSkeleton />
      </View>
    );
  }

  if (targetNotFound || !isValidHandle || !target) {
    return (
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top,
          transform: [{ translateX: denyShake }],
        }}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 }}>
          <View style={{ width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
            <Ionicons name="close-circle-outline" size={46} color={colors.textMuted} />
          </View>
          <Text style={{ color: colors.text, fontSize: 21, fontFamily: "Inter_700Bold", textAlign: "center" }}>
            Username unavailable
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" }}>
            @{cleanHandle || "username"} could not be opened.
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) router.back();
              else safeNavigate(session ? "/(tabs)/discover" : "/welcome");
            }}
            style={{ minWidth: 150, alignItems: "center", paddingVertical: 13, paddingHorizontal: 22, borderRadius: 12, backgroundColor: colors.accent }}
            activeOpacity={0.85}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}