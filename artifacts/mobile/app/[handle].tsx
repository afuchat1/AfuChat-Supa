/**
 * [handle].tsx — catch-all route for /@username and /username
 *
 * Rules:
 *  • /@username  → public profile page (no auth required, NOT a referral)
 *  • /username   → referral link: saves referrer_handle + sends to register
 *  • Any handle + logged-in user → navigate to /contact/[id]
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import NotFoundScreen from "@/app/+not-found";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

const { width: SW } = Dimensions.get("window");
const afuSymbol = require("@/assets/images/afu-symbol.png");

function safeNavigate(path: string, params?: Record<string, string>) {
  try {
    if (params) router.replace({ pathname: path as any, params });
    else router.replace(path as any);
  } catch {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const url = params ? path.replace(/\[(\w+)\]/g, (_, k) => params[k] || "") : path;
      window.location.href = url;
    }
  }
}

// ─── Public Profile (shown to unauthenticated visitors of /@username) ──────────

type PubProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  xp: number;
  current_grade: string;
  country: string | null;
};

type PubCounts = { followers: number; following: number; posts: number };

function PublicProfileScreen({ handle }: { handle: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PubProfile | null>(null);
  const [counts, setCounts] = useState<PubCounts>({ followers: 0, following: 0, posts: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      // Try primary handle first, then alias table
      let profileData: PubProfile | null = null;

      const { data: primary } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, xp, current_grade, country")
        .eq("handle", handle)
        .maybeSingle();

      if (primary) {
        profileData = primary as PubProfile;
      } else {
        // Try owned_usernames alias
        const { data: alias } = await supabase
          .from("owned_usernames")
          .select("owner_id")
          .eq("handle", handle)
          .maybeSingle();
        if (alias?.owner_id) {
          const { data: byId } = await supabase
            .from("profiles")
            .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, xp, current_grade, country")
            .eq("id", alias.owner_id)
            .maybeSingle();
          profileData = byId as PubProfile | null;
        }
      }

      if (!profileData) { setNotFound(true); setLoading(false); return; }
      setProfile(profileData);
      const data = profileData;

      const [{ count: followers }, { count: following }, { count: posts }] = await Promise.all([
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", data.id),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", data.id),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", data.id),
      ]);
      setCounts({ followers: followers || 0, following: following || 0, posts: posts || 0 });
      setLoading(false);
    }
    load();
  }, [handle]);

  if (loading) {
    return (
      <View style={[pub.root, pub.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.brand} size="large" />
      </View>
    );
  }
  if (notFound || !profile) return <NotFoundScreen />;

  function StatBlock({ label, value }: { label: string; value: number }) {
    return (
      <View style={pub.statBlock}>
        <Text style={[pub.statNum, { color: colors.text }]}>{value.toLocaleString()}</Text>
        <Text style={[pub.statLabel, { color: colors.textMuted }]}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={[pub.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View style={[pub.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[pub.headerTitle, { color: colors.text }]}>Profile</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Profile hero */}
        <View style={[pub.hero, { backgroundColor: colors.surface }]}>
          <Avatar
            uri={profile.avatar_url}
            name={profile.display_name}
            size={88}
            style={pub.avatar}
          />
          <View style={pub.nameRow}>
            <Text style={[pub.displayName, { color: colors.text }]}>{profile.display_name}</Text>
            {(profile.is_verified || profile.is_organization_verified) && (
              <VerifiedBadge size={20} />
            )}
          </View>
          <Text style={[pub.handleText, { color: colors.textMuted }]}>@{profile.handle}</Text>
          {profile.bio ? (
            <Text style={[pub.bio, { color: colors.text }]} numberOfLines={4}>{profile.bio}</Text>
          ) : null}
          {profile.country ? (
            <View style={pub.locationRow}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              <Text style={[pub.locationText, { color: colors.textMuted }]}>{profile.country}</Text>
            </View>
          ) : null}
        </View>

        {/* Stats */}
        <View style={[pub.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StatBlock label="Posts" value={counts.posts} />
          <View style={[pub.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock label="Followers" value={counts.followers} />
          <View style={[pub.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock label="Following" value={counts.following} />
        </View>

        {/* CTA buttons */}
        <View style={pub.ctaRow}>
          <TouchableOpacity
            style={[pub.ctaBtn, { backgroundColor: Colors.brand }]}
            onPress={() => router.push("/(auth)/login" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={pub.ctaBtnText}>Follow</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[pub.ctaBtn, pub.ctaBtnOutline, { borderColor: colors.border }]}
            onPress={() => router.push("/(auth)/login" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.text} />
            <Text style={[pub.ctaBtnText, { color: colors.text }]}>Message</Text>
          </TouchableOpacity>
        </View>

        {/* Join AfuChat banner */}
        <View style={[pub.joinCard, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "25" }]}>
          <Image source={afuSymbol} style={pub.joinLogo} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={[pub.joinTitle, { color: Colors.brand }]}>Join AfuChat</Text>
            <Text style={[pub.joinSub, { color: colors.textMuted }]}>
              Connect with @{profile.handle} and millions of others on AfuChat
            </Text>
          </View>
          <TouchableOpacity
            style={[pub.joinBtn, { backgroundColor: Colors.brand }]}
            onPress={() => router.push("/(auth)/register" as any)}
          >
            <Text style={pub.joinBtnText}>Sign up</Text>
          </TouchableOpacity>
        </View>

        {/* Nexa grade pill */}
        {profile.current_grade && (
          <View style={{ paddingHorizontal: 20 }}>
            <View style={[pub.gradePill, { backgroundColor: "#FF950010", borderColor: "#FF950030" }]}>
              <Ionicons name="flash" size={14} color="#FF9500" />
              <Text style={{ color: "#FF9500", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                {profile.current_grade} · {profile.xp.toLocaleString()} Nexa
              </Text>
            </View>
          </View>
        )}

        {/* Bottom padding so content clears the sticky sign-in bar */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Sticky sign-in prompt ─────────────────────────────────────────── */}
      <View
        style={[
          pub.signinBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <View style={pub.signinBarInner}>
          <Ionicons name="lock-closed" size={18} color={Colors.brand} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[pub.signinBarTitle, { color: colors.text }]}>
              Sign in to follow or message
            </Text>
            <Text style={[pub.signinBarSub, { color: colors.textMuted }]}>
              Join AfuChat to connect with @{profile.handle}
            </Text>
          </View>
        </View>
        <View style={pub.signinBtnRow}>
          <TouchableOpacity
            style={[pub.signinBtn, { backgroundColor: Colors.brand }]}
            onPress={() => router.push("/(auth)/login" as any)}
            activeOpacity={0.85}
          >
            <Text style={pub.signinBtnText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[pub.signinBtn, pub.signinBtnOutline, { borderColor: Colors.brand }]}
            onPress={() => router.push("/(auth)/register" as any)}
            activeOpacity={0.85}
          >
            <Text style={[pub.signinBtnText, { color: Colors.brand }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Router / Splash (handles redirect logic) ──────────────────────────────────

export default function HandleScreen() {
  const { handle: rawHandle } = useLocalSearchParams<{ handle: string }>();
  const { session, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigationState = useRootNavigationState();
  const hasNavigated = useRef(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const isAtHandle = (rawHandle || "").startsWith("@");
  const cleanHandle = (rawHandle || "").replace(/^@/, "").toLowerCase();
  const isValidHandle = /^[a-zA-Z0-9_]+$/.test(cleanHandle);

  // ── All hooks run unconditionally — React requires this ─────────────────────
  // Conditional returns are at the BOTTOM, after every hook.

  // Effect 1: resolve handle → profile ID (skipped in public-profile mode)
  // Checks primary handle first, then owned_usernames aliases so ALL handles a
  // user owns always route to the same profile.
  useEffect(() => {
    // Public profile mode (/@handle + guest): PublicProfileScreen fetches its own data.
    if (isAtHandle && !authLoading && !session) return;
    if (!cleanHandle || !isValidHandle) { setDataReady(true); return; }

    async function resolve() {
      // 1. Try the primary handle stored on the profile
      const { data: primary } = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", cleanHandle)
        .maybeSingle();

      if (primary?.id) { setProfileId(primary.id); setDataReady(true); return; }

      // 2. Fall back to owned_usernames alias table
      const { data: alias } = await supabase
        .from("owned_usernames")
        .select("owner_id")
        .eq("handle", cleanHandle)
        .maybeSingle();

      if (alias?.owner_id) { setProfileId(alias.owner_id); setDataReady(true); return; }

      setProfileNotFound(true);
      setDataReady(true);
    }
    resolve();
  }, [cleanHandle, isValidHandle, isAtHandle, authLoading, session]);

  // Effect 2: navigate once data is ready
  useEffect(() => {
    if (hasNavigated.current) return;
    if (!dataReady) return;
    if (authLoading) return;
    if (!navigationState?.key) return;
    if (profileNotFound || !cleanHandle || !isValidHandle) return;
    // Public profile mode handled inline below — no navigation needed.
    if (isAtHandle && !session) return;

    hasNavigated.current = true;

    if (session) {
      if (profileId) safeNavigate("/contact/[id]", { id: profileId });
    } else {
      if (profileId) {
        // Only save referrer when it's the /username (not @username) route
        if (!isAtHandle) {
          AsyncStorage.setItem("referrer_handle", cleanHandle).catch(() => {});
        }
        safeNavigate("/(auth)/register");
      }
    }
  }, [dataReady, authLoading, navigationState?.key, cleanHandle, isValidHandle, profileId, profileNotFound, session, isAtHandle]);

  // Effect 3: web fallback timeout
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (hasNavigated.current) return;
    if (isAtHandle && !session) return; // public profile — no redirect
    const timeout = setTimeout(() => {
      if (hasNavigated.current) return;
      if (!dataReady) return;
      if (profileNotFound) return;
      hasNavigated.current = true;
      if (typeof window !== "undefined") {
        window.location.href = session ? "/" : "/register";
      }
    }, 8000);
    return () => clearTimeout(timeout);
  }, [dataReady, session, profileNotFound, isAtHandle]);

  // ── Conditional renders — hooks are all done, safe to return early ───────────

  // /@username visited by a guest → show public profile card (no auth required)
  if (isAtHandle && !authLoading && !session) {
    if (!isValidHandle) return <NotFoundScreen />;
    return <PublicProfileScreen handle={cleanHandle} />;
  }

  if (dataReady && (profileNotFound || !isValidHandle)) return <NotFoundScreen />;

  return (
    <View style={[splash.container, { backgroundColor: Colors.brand, paddingTop: insets.top }]}>
      <Image source={afuSymbol} style={splash.logo} resizeMode="contain" />
      <Text style={splash.brandText}>AfuChat</Text>
      <ActivityIndicator size="small" color="#fff" style={splash.loader} />
      <Text style={splash.subText}>
        {session ? "Loading profile…" : isAtHandle ? "Loading profile…" : "Processing invite…"}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pub = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  hero: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 32, marginBottom: 2 },
  avatar: { marginBottom: 16 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  displayName: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  handleText: { fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 12 },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 10 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  statsCard: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  statBlock: { flex: 1, alignItems: "center", paddingVertical: 16 },
  statNum: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 10 },

  ctaRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 16 },
  ctaBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14 },
  ctaBtnOutline: { borderWidth: 1 },
  ctaBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  joinCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  joinLogo: { width: 40, height: 40, borderRadius: 10 },
  joinTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 2 },
  joinSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  joinBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  joinBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },

  gradePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },

  signinBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  signinBarInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  signinBarTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  signinBarSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  signinBtnRow: {
    flexDirection: "row",
    gap: 10,
  },
  signinBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
  },
  signinBtnOutline: {
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  signinBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});

const splash = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  logo: { width: 80, height: 80, borderRadius: 20 },
  brandText: { color: "#fff", fontSize: 24, fontWeight: "700", marginTop: 12 },
  loader: { marginTop: 24 },
  subText: { color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 8 },
});
