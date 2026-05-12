import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Channel = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
  is_verified: boolean;
  created_at: string;
  owner_id: string | null;
  owner: {
    id: string;
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
};

type Post = {
  id: string;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  like_count: number;
  view_count: number;
};

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ─── Main screen ─────────────────────────────────────────────────────────── */

export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors, accent, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);

  /* ── Load channel ── */
  const loadChannel = useCallback(async () => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("channels")
      .select(
        "id, name, description, avatar_url, subscriber_count, is_verified, created_at, owner_id, profiles!channels_owner_id_fkey(id, display_name, handle, avatar_url, is_verified)"
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const owner = (data as any).profiles;
    setChannel({
      id: data.id,
      name: data.name,
      description: data.description,
      avatar_url: data.avatar_url,
      subscriber_count: data.subscriber_count || 0,
      is_verified: !!data.is_verified,
      created_at: data.created_at,
      owner_id: data.owner_id,
      owner: owner
        ? {
            id: owner.id,
            display_name: owner.display_name,
            handle: owner.handle,
            avatar_url: owner.avatar_url,
            is_verified: !!owner.is_verified,
          }
        : null,
    });
    setLoading(false);
  }, [id]);

  /* ── Load posts ── */
  const loadPosts = useCallback(async () => {
    if (!id) return;
    setPostsLoading(true);
    try {
      const { data } = await supabase
        .from("posts")
        .select("id, content, image_url, video_url, created_at, like_count, view_count")
        .eq("channel_id", id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (data) setPosts(data as Post[]);
    } catch {
      // column may not exist yet — fail silently
    }
    setPostsLoading(false);
  }, [id]);

  /* ── Check subscription ── */
  const checkSubscription = useCallback(async () => {
    if (!user || !id) return;
    try {
      const { data } = await supabase
        .from("channel_subscribers")
        .select("id")
        .eq("channel_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      setIsSubscribed(!!data);
    } catch {
      // table may not exist yet
    }
  }, [user, id]);

  useEffect(() => {
    loadChannel();
    loadPosts();
    checkSubscription();
  }, [loadChannel, loadPosts, checkSubscription]);

  /* ── Toggle subscribe ── */
  async function toggleSubscribe() {
    if (!user) { router.push("/(auth)/login"); return; }
    if (!channel) return;
    setSubLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      if (isSubscribed) {
        await supabase
          .from("channel_subscribers")
          .delete()
          .eq("channel_id", channel.id)
          .eq("user_id", user.id);
        await supabase
          .from("channels")
          .update({ subscriber_count: Math.max(0, channel.subscriber_count - 1) })
          .eq("id", channel.id);
        setChannel((c) => c ? { ...c, subscriber_count: Math.max(0, c.subscriber_count - 1) } : c);
        setIsSubscribed(false);
      } else {
        await supabase
          .from("channel_subscribers")
          .upsert({ channel_id: channel.id, user_id: user.id }, { onConflict: "channel_id,user_id" });
        await supabase
          .from("channels")
          .update({ subscriber_count: channel.subscriber_count + 1 })
          .eq("id", channel.id);
        setChannel((c) => c ? { ...c, subscriber_count: c.subscriber_count + 1 } : c);
        setIsSubscribed(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      showAlert("Error", "Could not update subscription. Please try again.");
    }
    setSubLoading(false);
  }

  /* ── Share ── */
  async function shareChannel() {
    if (!channel) return;
    await Share.share({
      message: `Follow ${channel.name} on AfuChat! https://afuchat.com/channel/${channel.id}`,
      title: channel.name,
    });
  }

  /* ── Not found ── */
  if (!loading && notFound) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity style={[st.backBtn, { top: insets.top + 12 }]} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={st.center}>
          <Ionicons name="megaphone-outline" size={64} color={colors.textMuted} />
          <Text style={[st.nfTitle, { color: colors.text }]}>Channel Not Found</Text>
          <Text style={[st.nfSub, { color: colors.textMuted }]}>
            This channel may have been deleted or is no longer available.
          </Text>
          <TouchableOpacity
            style={[st.nfBtn, { backgroundColor: accent }]}
            onPress={() => router.back()}
          >
            <Text style={st.nfBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity style={[st.backBtn, { top: insets.top + 12 }]} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={st.center}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      </View>
    );
  }

  if (!channel) return null;

  const PURPLE = "#5856D6";

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      {/* ── Header bar ── */}
      <View style={[st.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.topBarBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.topBarTitle, { color: colors.text }]} numberOfLines={1}>{channel.name}</Text>
        <TouchableOpacity onPress={shareChannel} hitSlop={12} style={st.topBarBtn}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── Channel hero ── */}
        <View style={[st.hero, { backgroundColor: colors.surface }]}>
          <View style={st.heroAvatar}>
            {channel.avatar_url ? (
              <Image source={{ uri: channel.avatar_url }} style={st.avatar} />
            ) : (
              <LinearGradient colors={[PURPLE, "#A855F7"]} style={st.avatarGradient}>
                <Ionicons name="megaphone" size={36} color="#fff" />
              </LinearGradient>
            )}
            {channel.is_verified && (
              <View style={st.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#5856D6" />
              </View>
            )}
          </View>

          <Text style={[st.channelName, { color: colors.text }]}>{channel.name}</Text>

          {channel.description ? (
            <Text style={[st.channelDesc, { color: colors.textMuted }]}>{channel.description}</Text>
          ) : null}

          {/* Stats row */}
          <View style={st.statsRow}>
            <View style={st.statItem}>
              <Text style={[st.statValue, { color: colors.text }]}>{fmtNum(channel.subscriber_count)}</Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>Subscribers</Text>
            </View>
            <View style={[st.statDivider, { backgroundColor: colors.border }]} />
            <View style={st.statItem}>
              <Text style={[st.statValue, { color: colors.text }]}>{posts.length}</Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>Posts</Text>
            </View>
            <View style={[st.statDivider, { backgroundColor: colors.border }]} />
            <View style={st.statItem}>
              <Text style={[st.statValue, { color: colors.text }]}>
                {new Date(channel.created_at).getFullYear()}
              </Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>Since</Text>
            </View>
          </View>

          {/* Subscribe button */}
          <TouchableOpacity
            style={[
              st.subBtn,
              isSubscribed
                ? { backgroundColor: colors.backgroundSecondary, borderWidth: 1.5, borderColor: colors.border }
                : { backgroundColor: PURPLE },
            ]}
            onPress={toggleSubscribe}
            disabled={subLoading}
          >
            {subLoading ? (
              <ActivityIndicator color={isSubscribed ? colors.textMuted : "#fff"} size="small" />
            ) : (
              <>
                <Ionicons
                  name={isSubscribed ? "notifications" : "notifications-outline"}
                  size={16}
                  color={isSubscribed ? colors.textMuted : "#fff"}
                />
                <Text style={[st.subBtnText, { color: isSubscribed ? colors.textMuted : "#fff" }]}>
                  {isSubscribed ? "Subscribed" : "Subscribe"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Owner card ── */}
        {channel.owner && (
          <TouchableOpacity
            style={[st.ownerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: channel.owner!.id } })}
            activeOpacity={0.75}
          >
            <Ionicons name="person-circle-outline" size={15} color={colors.textMuted} style={{ marginRight: 2 }} />
            <Text style={[st.ownerLabel, { color: colors.textMuted }]}>Channel by</Text>
            <Avatar uri={channel.owner.avatar_url} name={channel.owner.display_name} size={24} />
            <Text style={[st.ownerName, { color: colors.text }]}>{channel.owner.display_name}</Text>
            <VerifiedBadge isVerified={channel.owner.is_verified} size={14} />
            <Text style={[st.ownerHandle, { color: colors.textMuted }]}>@{channel.owner.handle}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
        )}

        {/* ── Posts section ── */}
        <View style={[st.postsHeader, { borderBottomColor: colors.border }]}>
          <Ionicons name="megaphone-outline" size={15} color={PURPLE} />
          <Text style={[st.postsHeaderText, { color: colors.text }]}>Channel Posts</Text>
        </View>

        {postsLoading ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <ActivityIndicator color={PURPLE} />
          </View>
        ) : posts.length === 0 ? (
          <View style={st.emptyPosts}>
            <Ionicons name="document-text-outline" size={44} color={colors.textMuted} />
            <Text style={[st.emptyPostsTitle, { color: colors.text }]}>No posts yet</Text>
            <Text style={[st.emptyPostsSub, { color: colors.textMuted }]}>
              Subscribe to get notified when this channel publishes.
            </Text>
          </View>
        ) : (
          posts.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={[st.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } })}
              activeOpacity={0.8}
            >
              {post.image_url ? (
                <Image source={{ uri: post.image_url }} style={st.postImage} contentFit="cover" />
              ) : null}
              {post.content ? (
                <Text style={[st.postContent, { color: colors.text }]} numberOfLines={3}>
                  {post.content}
                </Text>
              ) : null}
              <View style={st.postMeta}>
                <Text style={[st.postMetaText, { color: colors.textMuted }]}>{timeAgo(post.created_at)}</Text>
                {post.like_count > 0 && (
                  <View style={st.postMetaItem}>
                    <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
                    <Text style={[st.postMetaText, { color: colors.textMuted }]}>{fmtNum(post.like_count)}</Text>
                  </View>
                )}
                {post.view_count > 0 && (
                  <View style={st.postMetaItem}>
                    <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
                    <Text style={[st.postMetaText, { color: colors.textMuted }]}>{fmtNum(post.view_count)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const st = StyleSheet.create({
  root: { flex: 1 },
  backBtn: { position: "absolute", left: 16, zIndex: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "700", textAlign: "center" },

  hero: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 10,
    marginBottom: 8,
  },
  heroAvatar: { position: "relative", marginBottom: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarGradient: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 1,
  },

  channelName: { fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "700", textAlign: "center" },
  channelDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },

  statsRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, height: 28, borderRadius: 1 },

  subBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 24,
    marginTop: 6,
  },
  subBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  ownerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ownerLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginRight: 2 },
  ownerName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  ownerHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },

  postsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  postsHeaderText: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },

  emptyPosts: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 40 },
  emptyPostsTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptyPostsSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  postCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  postImage: { width: "100%", height: 180 },
  postContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, padding: 14 },
  postMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  postMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  postMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  nfTitle: { fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700", textAlign: "center" },
  nfSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  nfBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  nfBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
