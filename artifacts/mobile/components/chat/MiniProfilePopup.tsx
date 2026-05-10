import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

type MiniProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
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
  if (diff < 2 * 60 * 1000) return { text: "Online now", online: true };
  if (diff < 60 * 60 * 1000) return { text: "last seen recently", online: false };
  if (diff < 24 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3600000);
    return { text: `last seen ${h}h ago`, online: false };
  }
  const d = Math.floor(diff / 86400000);
  return { text: `last seen ${d}d ago`, online: false };
}

function StatPill({ label, value }: { label: string; value: number | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statPill}>
      <Text style={[styles.statValue, { color: colors.text }]}>
        {value === null ? "–" : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

interface Props {
  userId: string | null;
  visible: boolean;
  onClose: () => void;
  currentChatId?: string | null;
}

export default function MiniProfilePopup({ userId, visible, onClose, currentChatId }: Props) {
  const { colors, accent } = useTheme();
  const { user } = useAuth();

  const [profile, setProfile] = useState<MiniProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [postCount, setPostCount] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [theyFollowMe, setTheyFollowMe] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const isSelf = user?.id === userId;

  useEffect(() => {
    if (!visible || !userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setProfile(null);
    setFollowerCount(null);
    setFollowingCount(null);
    setPostCount(null);
    setIsFollowing(false);
    setTheyFollowMe(false);

    Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, is_business_mode, last_seen, show_online_status, website_url, country, xp")
        .eq("id", userId)
        .single(),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", userId).in("visibility", ["public", "followers"]),
      user
        ? supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", userId).maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from("follows").select("id").eq("follower_id", userId).eq("following_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([profileRes, followersRes, followingRes, postsRes, followingMeRes, theyFollowMeRes]) => {
      if (profileRes.data) setProfile(profileRes.data as MiniProfile);
      setFollowerCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);
      setPostCount(postsRes.count ?? 0);
      setIsFollowing(!!(followingMeRes as any)?.data);
      setTheyFollowMe(!!(theyFollowMeRes as any)?.data);
      setLoading(false);
    });
  }, [visible, userId, user?.id]);

  const handleFollow = useCallback(async () => {
    if (!user || !userId || followLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", userId);
      setIsFollowing(false);
      setFollowerCount((c) => Math.max(0, (c ?? 1) - 1));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
      setIsFollowing(true);
      setFollowerCount((c) => (c ?? 0) + 1);
    }
    setFollowLoading(false);
  }, [user, userId, isFollowing, followLoading]);

  const handleMessage = useCallback(() => {
    if (!userId) return;
    onClose();
    if (currentChatId) return;
    router.push({ pathname: "/chat/[id]", params: { id: userId } });
  }, [userId, currentChatId, onClose]);

  const handleViewProfile = useCallback(() => {
    if (!userId) return;
    onClose();
    if (profile) {
      setProfileCache(userId, profile as any);
      router.push({ pathname: "/contact/[id]", params: { id: userId, init_name: profile.display_name, init_handle: profile.handle, init_avatar: profile.avatar_url ?? "", init_verified: profile.is_verified ? "1" : "0", init_org_verified: profile.is_organization_verified ? "1" : "0" } });
    } else {
      router.push({ pathname: "/contact/[id]", params: { id: userId } });
    }
  }, [userId, onClose, profile]);

  const ls = profile ? formatLastSeen(profile.last_seen, profile.show_online_status) : null;

  return (
    <SwipeableBottomSheet visible={visible} onClose={onClose} maxHeight="72%">
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        ) : !profile ? null : (
          <>
            {/* ── Cover / Avatar area ──────────────────────── */}
            <View style={[styles.coverArea, { backgroundColor: accent + "18" }]}>
              <View style={styles.avatarWrap}>
                <Avatar
                  uri={profile.avatar_url}
                  name={profile.display_name}
                  size={76}
                  online={ls?.online}
                  square={profile.is_organization_verified || profile.is_business_mode}
                />
                {ls?.online && (
                  <View style={[styles.onlineDot, { borderColor: colors.surface }]} />
                )}
              </View>
            </View>

            {/* ── Name / handle / bio ──────────────────────── */}
            <View style={styles.infoSection}>
              <View style={styles.nameRow}>
                <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                  {profile.display_name}
                </Text>
                <VerifiedBadge
                  isVerified={profile.is_verified}
                  isOrganizationVerified={profile.is_organization_verified}
                  size={17}
                />
              </View>

              <Text style={[styles.handle, { color: colors.textMuted }]}>
                @{profile.handle}
              </Text>

              {ls && (
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: ls.online ? "#34C759" : colors.textMuted }]} />
                  <Text style={[styles.statusText, { color: ls.online ? "#34C759" : colors.textMuted }]}>
                    {ls.text}
                  </Text>
                </View>
              )}

              {profile.bio ? (
                <Text style={[styles.bio, { color: colors.textSecondary }]} numberOfLines={3}>
                  {profile.bio}
                </Text>
              ) : null}

              {(profile.country || profile.website_url) ? (
                <View style={styles.metaRow}>
                  {profile.country ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                      <Text style={[styles.metaText, { color: colors.textMuted }]}>{profile.country}</Text>
                    </View>
                  ) : null}
                  {profile.website_url ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="link-outline" size={13} color={accent} />
                      <Text style={[styles.metaText, { color: accent }]} numberOfLines={1}>
                        {profile.website_url.replace(/^https?:\/\//, "")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* ── Stats row ────────────────────────────────── */}
            <View style={[styles.statsRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
              <StatPill label="Followers" value={followerCount} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <StatPill label="Following" value={followingCount} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <StatPill label="Posts" value={postCount} />
              {profile.xp > 0 && (
                <>
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <StatPill label="XP" value={profile.xp} />
                </>
              )}
            </View>

            {/* ── Action buttons ───────────────────────────── */}
            <View style={styles.actions}>
              {!isSelf && user && (() => {
                const _fs = isFollowing && theyFollowMe ? "friends" : !isFollowing && theyFollowMe ? "follow_back" : isFollowing ? "following" : "follow";
                const _bg = _fs === "follow" ? accent : _fs === "follow_back" ? "#FF9500" : colors.inputBg;
                const _bc = _fs === "friends" ? "#34C759" : _fs === "following" ? colors.border : undefined;
                const _bw = _fs === "following" || _fs === "friends" ? 1 : 0;
                const _tc = _fs === "follow" || _fs === "follow_back" ? "#fff" : _fs === "friends" ? "#34C759" : colors.textMuted;
                const _label = _fs === "follow" ? "Follow" : _fs === "follow_back" ? "Follow Back" : _fs === "following" ? "Following" : "Friends";
                const _icon: any = _fs === "follow" ? "person-add-outline" : _fs === "follow_back" ? "person-add" : _fs === "following" ? "checkmark" : "heart";
                return (
                  <TouchableOpacity
                    style={[styles.followBtn, { backgroundColor: _bg, borderColor: _bc, borderWidth: _bw }]}
                    onPress={handleFollow}
                    activeOpacity={0.82}
                    disabled={followLoading}
                  >
                    {followLoading ? (
                      <ActivityIndicator size="small" color={_tc} />
                    ) : (
                      <>
                        <Ionicons name={_icon} size={15} color={_tc} />
                        <Text style={[styles.followBtnText, { color: _tc }]}>{_label}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })()}

              {!isSelf && !currentChatId && user && (
                <TouchableOpacity
                  style={[styles.actionIconBtn, { backgroundColor: colors.inputBg }]}
                  onPress={handleMessage}
                  activeOpacity={0.82}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.text} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionIconBtn, { backgroundColor: colors.inputBg }]}
                onPress={handleViewProfile}
                activeOpacity={0.82}
              >
                <Ionicons name="person-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SwipeableBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    paddingBottom: 28,
  },
  loadingWrap: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  coverArea: {
    height: 72,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  avatarWrap: {
    position: "relative",
    marginBottom: -38,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  onlineDot: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#34C759",
    borderWidth: 2.5,
  },
  infoSection: {
    alignItems: "center",
    paddingTop: 46,
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  displayName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  handle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  bio: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 4,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    marginHorizontal: 0,
  },
  statPill: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
  },
  followBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    minHeight: 44,
  },
  followBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  actionIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
