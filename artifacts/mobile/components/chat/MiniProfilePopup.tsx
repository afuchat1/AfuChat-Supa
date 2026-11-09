import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { setProfileCache } from "@/lib/profileCache";

const AVATAR_SIZE   = 68;
const BANNER_H      = 130;
const AVATAR_PULL   = AVATAR_SIZE / 2; // how far the identity row pulls up into banner

type MiniProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  is_business_mode: boolean;
  last_seen: string | null;
  show_online_status: boolean;
  website_url: string | null;
  country: string | null;
  xp: number;
};

function formatLastSeen(ts: string | null, showOnline: boolean): { text: string; online: boolean } {
  if (!showOnline || !ts) return { text: "last seen recently", online: false };
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 2 * 60 * 1000)       return { text: "Online now",           online: true };
  if (diff < 60 * 60 * 1000)      return { text: "last seen recently",   online: false };
  if (diff < 24 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3_600_000);
    return { text: `last seen ${h}h ago`, online: false };
  }
  const d = Math.floor(diff / 86_400_000);
  return { text: `last seen ${d}d ago`, online: false };
}

function fmt(n: number | null) {
  if (n === null) return "N/A";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface Props {
  userId: string | null;
  visible: boolean;
  onClose: () => void;
  currentChatId?: string | null;
}

export default function MiniProfilePopup({ userId, visible, onClose, currentChatId }: Props) {
  const { colors, accent, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [profile,      setProfile]      = useState<MiniProfile | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [followers,    setFollowers]    = useState<number | null>(null);
  const [following,    setFollowing]    = useState<number | null>(null);
  const [posts,        setPosts]        = useState<number | null>(null);
  const [isFollowing,  setIsFollowing]  = useState(false);
  const [theyFollow,   setTheyFollow]   = useState(false);
  const [followBusy,   setFollowBusy]   = useState(false);

  const isSelf = user?.id === userId;
  const isOrg  = !!(profile?.is_organization_verified || profile?.is_business_mode);

  useEffect(() => {
    if (!visible || !userId) {
      setProfile(null); setLoading(false); return;
    }
    setLoading(true);
    setFollowers(null); setFollowing(null); setPosts(null);
    setIsFollowing(false); setTheyFollow(false);

    Promise.all([
      supabase.from("profiles")
        .select("id,display_name,handle,avatar_url,banner_url,bio,is_verified,is_organization_verified,is_business_mode,last_seen,show_online_status,website_url,country,xp")
        .eq("id", userId).single(),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", userId).in("visibility", ["public","followers"]),
      user ? supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", userId).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from("follows").select("id").eq("follower_id", userId).eq("following_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([pRes, flrRes, flgRes, psRes, iFlwRes, theyRes]) => {
      if (pRes.data) { setProfile(pRes.data as MiniProfile); setProfileCache(pRes.data.id, pRes.data as any); }
      setFollowers(flrRes.count ?? 0);
      setFollowing(flgRes.count ?? 0);
      setPosts(psRes.count ?? 0);
      setIsFollowing(!!(iFlwRes as any)?.data);
      setTheyFollow(!!(theyRes as any)?.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [visible, userId, user?.id]);

  const handleFollow = useCallback(async () => {
    if (!user || !userId || followBusy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowBusy(true);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", userId);
      setIsFollowing(false);
      setFollowers(v => (v ?? 1) - 1);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
      setIsFollowing(true);
      setFollowers(v => (v ?? 0) + 1);
    }
    setFollowBusy(false);
  }, [user, userId, isFollowing, followBusy]);

  const handleMessage = useCallback(async () => {
    if (!user || !userId) return;
    onClose();
    const { data } = await supabase.from("conversations")
      .select("id").eq("is_group", false)
      .or(`and(chat_members.user_id.eq.${user.id},chat_members.user_id.eq.${userId})`)
      .maybeSingle();
    if (data?.id) {
      router.push({ pathname: "/chat/[id]", params: { id: data.id } });
    } else {
      const { data: conv } = await supabase.from("conversations")
        .insert({ is_group: false, created_by: user.id }).select("id").single();
      if (conv?.id) {
        await supabase.from("chat_members").insert([
          { chat_id: conv.id, user_id: user.id },
          { chat_id: conv.id, user_id: userId },
        ]);
        router.push({ pathname: "/chat/[id]", params: { id: conv.id } });
      }
    }
  }, [user, userId, onClose]);

  const ls = profile ? formatLastSeen(profile.last_seen, profile.show_online_status) : null;

  // ── Follow button state ────────────────────────────────────────────────────
  const fState = isFollowing && theyFollow ? "friends"
    : !isFollowing && theyFollow ? "follow_back"
    : isFollowing ? "following"
    : "follow";
  const fBg    = fState === "follow" ? accent : fState === "follow_back" ? "#FF9500" : colors.inputBg;
  const fBrd   = fState === "friends" ? "#34C759" : fState === "following" ? colors.border : "transparent";
  const fBw    = (fState === "following" || fState === "friends") ? 1 : 0;
  const fTc    = (fState === "follow" || fState === "follow_back") ? "#fff" : fState === "friends" ? "#34C759" : colors.textMuted;
  const fLabel = fState === "follow" ? "Follow" : fState === "follow_back" ? "Follow Back" : fState === "following" ? "Following" : "Friends ♡";
  const fIcon: any = fState === "follow" ? "person-add" : fState === "follow_back" ? "person-add" : fState === "following" ? "checkmark" : "heart";

  return (
    <SwipeableBottomSheet visible={visible} onClose={onClose} maxHeight="78%" backgroundColor={colors.surface}>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : !profile ? null : (
        <View>
          {/* ── 1. Banner — clipped by its own container ── */}
          <View style={st.bannerWrap}>
            {profile.banner_url ? (
              <Image source={{ uri: profile.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: accent + "28" }]} />
            )}
            {/* bottom gradient so text beneath is readable */}
            <View style={st.bannerGrad} />
          </View>

          {/* ── 2. Identity row — pulled UP into banner with negative marginTop ── */}
          <View style={st.identityRow}>
            {/* Avatar — NOT inside overflow:hidden, so square/circle renders fine */}
            <View style={[
              st.avatarRing,
              { borderColor: colors.surface },
              isOrg && st.avatarRingSquare,
            ]}>
              <Avatar
                uri={profile.avatar_url}
                name={profile.display_name}
                size={AVATAR_SIZE}
                square={isOrg}
              />
              {ls?.online && (
                <View style={[st.onlineDot, { borderColor: colors.surface }]} />
              )}
            </View>

            {/* Name + handle */}
            <View style={st.nameBlock}>
              <View style={st.nameRow}>
                <Text style={[st.displayName, { color: colors.text }]} numberOfLines={1}>
                  {profile.display_name}
                </Text>
                <VerifiedBadge
                  isVerified={profile.is_verified}
                  isOrganizationVerified={profile.is_organization_verified}
                  size={16}
                />
              </View>
              <Text style={[st.handle, { color: colors.textMuted }]}>@{profile.handle}</Text>
            </View>

            {/* Quick action pills */}
            <View style={st.quickPills}>
              {!isSelf && !currentChatId && user && (
                <TouchableOpacity
                  style={[st.pill, { backgroundColor: accent + "18" }]}
                  onPress={handleMessage} activeOpacity={0.78}>
                  <Ionicons name="chatbubble" size={17} color={accent} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[st.pill, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)" }]}
                onPress={() => { onClose(); router.push({ pathname: "/contact/[id]", params: { id: profile.id } }); }}
                activeOpacity={0.78}>
                <Ionicons name="person" size={17} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 3. Status / bio / meta ── */}
          <View style={st.infoBlock}>
            {ls && (
              <View style={st.statusRow}>
                <View style={[st.statusDot, { backgroundColor: ls.online ? "#34C759" : colors.textMuted }]} />
                <Text style={[st.statusText, { color: ls.online ? "#34C759" : colors.textMuted }]}>
                  {ls.text}
                </Text>
              </View>
            )}

            {profile.bio ? (
              <Text style={[st.bio, { color: colors.textSecondary }]} numberOfLines={3}>
                {profile.bio}
              </Text>
            ) : null}

            {(profile.country || profile.website_url) ? (
              <View style={st.metaRow}>
                {profile.country ? (
                  <View style={st.metaItem}>
                    <Ionicons name="location" size={12} color={colors.textMuted} />
                    <Text style={[st.metaText, { color: colors.textMuted }]}>{profile.country}</Text>
                  </View>
                ) : null}
                {profile.website_url ? (
                  <TouchableOpacity style={st.metaItem} activeOpacity={0.7}
                    onPress={() => {
                      const url = /^https?:\/\//i.test(profile.website_url!)
                        ? profile.website_url! : `https://${profile.website_url!}`;
                      Linking.openURL(url).catch(() => {});
                    }}>
                    <Ionicons name="link" size={12} color={accent} />
                    <Text style={[st.metaText, { color: accent }]} numberOfLines={1}>
                      {profile.website_url.replace(/^https?:\/\//, "")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* ── 4. Stats row ── */}
          <View style={[st.statsRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            {[
              { label: "Followers", val: followers },
              { label: "Following", val: following },
              { label: "Posts",     val: posts },
              ...(profile.xp > 0 ? [{ label: "XP", val: profile.xp }] : []),
            ].map((s, i, arr) => (
              <React.Fragment key={s.label}>
                <View style={st.statCell}>
                  <Text style={[st.statVal, { color: colors.text }]}>{fmt(s.val)}</Text>
                  <Text style={[st.statLbl, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
                {i < arr.length - 1 && <View style={[st.statDiv, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            ))}
          </View>

          {/* ── 5. Follow button ── */}
          {!isSelf && user && (
            <View style={[st.actions, { paddingBottom: insets.bottom + 20 }]}>
              <TouchableOpacity
                style={[st.followBtn, { backgroundColor: fBg, borderColor: fBrd, borderWidth: fBw }]}
                onPress={handleFollow} activeOpacity={0.82} disabled={followBusy}>
                {followBusy ? (
                  <ActivityIndicator size="small" color={fTc} />
                ) : (
                  <>
                    <Ionicons name={fIcon} size={15} color={fTc} />
                    <Text style={[st.followBtnText, { color: fTc }]}>{fLabel}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SwipeableBottomSheet>
  );
}

const st = StyleSheet.create({
  loadingWrap: {
    height: 260, alignItems: "center", justifyContent: "center",
  },

  /* Banner — has its OWN overflow:hidden so the image is clipped */
  bannerWrap: {
    height: BANNER_H,
    overflow: "hidden",
    position: "relative",
  },
  bannerGrad: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: 48,
    backgroundColor: "transparent",
  },

  /* Identity row — pulls itself UP into the banner with negative marginTop */
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: -AVATAR_PULL,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },

  avatarRing: {
    borderRadius: AVATAR_SIZE / 2 + 3,
    borderWidth: 3,
    padding: 0,
    position: "relative",
    ...Platform.select({
      web: { filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.22))" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 8 },
    }),
  },
  avatarRingSquare: {
    borderRadius: AVATAR_SIZE * 0.22 + 3,
  },
  onlineDot: {
    position: "absolute",
    bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#34C759",
    borderWidth: 2.5,
  },

  nameBlock: {
    flex: 1,
    paddingTop: AVATAR_PULL + 4, // push text below the banner edge
    gap: 1,
  },
  nameRow: {
    flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap",
  },
  displayName: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  handle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  quickPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingTop: AVATAR_PULL + 4,
  },
  pill: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },

  /* Info: status, bio, meta */
  infoBlock: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 6,
  },
  statusRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
  },
  statusDot: {
    width: 7, height: 7, borderRadius: 4,
  },
  statusText: {
    fontSize: 12, fontFamily: "Inter_400Regular",
  },
  bio: {
    fontSize: 13, fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row", alignItems: "center", gap: 3,
  },
  metaText: {
    fontSize: 12, fontFamily: "Inter_400Regular",
  },

  /* Stats */
  statsRow: {
    flexDirection: "row", alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  statCell: {
    flex: 1, alignItems: "center", gap: 2,
  },
  statVal: {
    fontSize: 17, fontFamily: "Inter_700Bold",
  },
  statLbl: {
    fontSize: 10, fontFamily: "Inter_400Regular",
  },
  statDiv: {
    width: StyleSheet.hairlineWidth, height: 28,
  },

  /* Actions */
  actions: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  followBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 13, borderRadius: 14, minHeight: 48,
  },
  followBtnText: {
    fontSize: 15, fontFamily: "Inter_600SemiBold",
  },
});
