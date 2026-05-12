import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
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
import GiftPickerSheet, { DbGift } from "@/components/gifts/GiftPickerSheet";

const PURPLE = "#5856D6";

type Channel = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
  is_verified: boolean;
  is_public: boolean;
  created_at: string;
  owner_id: string | null;
  owner: {
    id: string;
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_verified: boolean;
    acoin: number;
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
  myLike?: boolean;
  reply_count?: number;
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
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [giftVisible, setGiftVisible] = useState(false);
  const [giftSending, setGiftSending] = useState(false);
  const [ownerAcoin, setOwnerAcoin] = useState(0);
  const [myAcoin, setMyAcoin] = useState(0);

  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isOwner = !!(user && channel?.owner_id === user.id);

  const loadChannel = useCallback(async () => {
    if (!id) { setNotFound(true); setLoading(false); return; }

    const { data, error } = await supabase
      .from("channels")
      .select(
        "id, name, description, avatar_url, subscriber_count, is_verified, is_public, created_at, owner_id, profiles!channels_owner_id_fkey(id, display_name, handle, avatar_url, is_verified, acoin)"
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !data) { setNotFound(true); setLoading(false); return; }

    const owner = (data as any).profiles;
    setChannel({
      id: data.id,
      name: data.name,
      description: data.description,
      avatar_url: data.avatar_url,
      subscriber_count: data.subscriber_count || 0,
      is_verified: !!(data as any).is_verified,
      is_public: data.is_public ?? true,
      created_at: data.created_at,
      owner_id: data.owner_id,
      owner: owner
        ? {
            id: owner.id,
            display_name: owner.display_name,
            handle: owner.handle,
            avatar_url: owner.avatar_url,
            is_verified: !!owner.is_verified,
            acoin: owner.acoin ?? 0,
          }
        : null,
    });
    if (owner) setOwnerAcoin(owner.acoin ?? 0);
    setLoading(false);
  }, [id]);

  const loadPosts = useCallback(async () => {
    if (!id) return;
    setPostsLoading(true);
    try {
      const { data: postsData } = await supabase
        .from("posts")
        .select("id, content, image_url, video_url, created_at, like_count, view_count")
        .eq("channel_id", id)
        .order("created_at", { ascending: false })
        .limit(40);

      if (!postsData) { setPostsLoading(false); return; }

      let likedSet = new Set<string>();
      if (user) {
        const { data: likesData } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postsData.map((p) => p.id));
        if (likesData) likedSet = new Set(likesData.map((l) => l.post_id));
      }

      const { data: replyCounts } = await supabase
        .from("post_replies")
        .select("post_id")
        .in("post_id", postsData.map((p) => p.id));

      const replyMap: Record<string, number> = {};
      if (replyCounts) {
        for (const r of replyCounts) {
          replyMap[r.post_id] = (replyMap[r.post_id] ?? 0) + 1;
        }
      }

      setPosts(
        postsData.map((p) => ({
          ...p,
          myLike: likedSet.has(p.id),
          reply_count: replyMap[p.id] ?? 0,
        }))
      );
    } catch (_) {}
    setPostsLoading(false);
  }, [id, user]);

  const checkSubscription = useCallback(async () => {
    if (!user || !id) return;
    const { data } = await supabase
      .from("channel_subscriptions")
      .select("id")
      .eq("channel_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    setIsSubscribed(!!data);
  }, [user, id]);

  const loadMyAcoin = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("acoin")
      .eq("id", user.id)
      .maybeSingle();
    if (data) setMyAcoin(data.acoin ?? 0);
  }, [user]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadChannel(), loadPosts(), checkSubscription(), loadMyAcoin()]);
    setRefreshing(false);
  }, [loadChannel, loadPosts, checkSubscription, loadMyAcoin]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`channel_posts_${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts", filter: `channel_id=eq.${id}` },
        (payload) => {
          const newPost = payload.new as Post;
          setPosts((prev) => [{ ...newPost, myLike: false, reply_count: 0 }, ...prev]);
        }
      )
      .subscribe();
    realtimeRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function toggleSubscribe() {
    if (!user) { router.push("/(auth)/login" as any); return; }
    if (!channel) return;
    setSubLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isSubscribed) {
        await supabase
          .from("channel_subscriptions")
          .delete()
          .eq("channel_id", channel.id)
          .eq("user_id", user.id);
        await supabase.rpc("decrement_channel_subscriber", { p_channel_id: channel.id });
        setChannel((c) => c ? { ...c, subscriber_count: Math.max(0, c.subscriber_count - 1) } : c);
        setIsSubscribed(false);
      } else {
        await supabase
          .from("channel_subscriptions")
          .upsert({ channel_id: channel.id, user_id: user.id }, { onConflict: "channel_id,user_id" });
        await supabase.rpc("increment_channel_subscriber", { p_channel_id: channel.id });
        setChannel((c) => c ? { ...c, subscriber_count: c.subscriber_count + 1 } : c);
        setIsSubscribed(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      showAlert("Error", "Could not update subscription. Please try again.");
    }
    setSubLoading(false);
  }

  async function toggleLike(postId: string) {
    if (!user) { router.push("/(auth)/login" as any); return; }
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const nowLiked = !post.myLike;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, myLike: nowLiked, like_count: nowLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1) }
          : p
      )
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (nowLiked) {
      await supabase.from("post_likes").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" });
      await supabase.rpc("increment_post_like", { p_post_id: postId });
    } else {
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
      await supabase.rpc("decrement_post_like", { p_post_id: postId });
    }
  }

  async function sendGift(gift: DbGift, message: string, price: number) {
    if (!user || !channel?.owner) return;
    if (myAcoin < price) {
      showAlert("Insufficient ACoins", `You need ${price} AC but only have ${myAcoin} AC.`);
      return;
    }
    setGiftSending(true);
    try {
      const { error } = await supabase.from("gift_transactions").insert({
        gift_id: gift.id,
        sender_id: user.id,
        receiver_id: channel.owner.id,
        channel_id: channel.id,
        xp_cost: price,
        message: message || null,
        is_anonymous: false,
      });
      if (error) throw error;
      await supabase
        .from("profiles")
        .update({ acoin: myAcoin - price })
        .eq("id", user.id);
      setMyAcoin((prev) => Math.max(0, prev - price));
      setGiftVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Gift Sent!", `You sent ${gift.emoji} ${gift.name} to ${channel.name}!`);
    } catch {
      showAlert("Error", "Could not send gift. Please try again.");
    }
    setGiftSending(false);
  }

  async function shareChannel() {
    if (!channel) return;
    await Share.share({
      message: `Follow ${channel.name} on AfuChat! https://afuchat.com/channel/${channel.id}`,
      title: channel.name,
    });
  }

  if (!loading && notFound) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity style={[st.topBarBtn, { margin: 8 }]} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={st.center}>
          <Ionicons name="megaphone-outline" size={64} color={colors.textMuted} />
          <Text style={[st.nfTitle, { color: colors.text }]}>Channel Not Found</Text>
          <Text style={[st.nfSub, { color: colors.textMuted }]}>
            This channel may have been deleted or is no longer available.
          </Text>
          <TouchableOpacity style={[st.nfBtn, { backgroundColor: PURPLE }]} onPress={() => router.back()}>
            <Text style={st.nfBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={st.center}>
          <ActivityIndicator color={PURPLE} size="large" />
        </View>
      </View>
    );
  }

  if (!channel) return null;

  function PostCard({ post }: { post: Post }) {
    return (
      <View style={[st.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {post.image_url ? (
          <Image source={{ uri: post.image_url }} style={st.postImage} contentFit="cover" />
        ) : null}
        {post.content ? (
          <Text style={[st.postContent, { color: colors.text }]}>{post.content}</Text>
        ) : null}
        <View style={[st.postActions, { borderTopColor: colors.border }]}>
          <Text style={[st.postTime, { color: colors.textMuted }]}>{timeAgo(post.created_at)}</Text>
          <View style={{ flexDirection: "row", gap: 16, marginLeft: "auto" }}>
            <TouchableOpacity
              style={st.postAction}
              onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } })}
              hitSlop={8}
            >
              <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
              {(post.reply_count ?? 0) > 0 && (
                <Text style={[st.postActionCount, { color: colors.textMuted }]}>
                  {fmtNum(post.reply_count!)}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={st.postAction}
              onPress={() => toggleLike(post.id)}
              hitSlop={8}
            >
              <Ionicons
                name={post.myLike ? "heart" : "heart-outline"}
                size={16}
                color={post.myLike ? "#FF2D55" : colors.textMuted}
              />
              {post.like_count > 0 && (
                <Text style={[st.postActionCount, { color: post.myLike ? "#FF2D55" : colors.textMuted }]}>
                  {fmtNum(post.like_count)}
                </Text>
              )}
            </TouchableOpacity>

            {post.view_count > 0 && (
              <View style={st.postAction}>
                <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                <Text style={[st.postActionCount, { color: colors.textMuted }]}>
                  {fmtNum(post.view_count)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  const ListHeader = () => (
    <View>
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
              <Ionicons name="checkmark-circle" size={20} color={PURPLE} />
            </View>
          )}
        </View>

        <Text style={[st.channelName, { color: colors.text }]}>{channel.name}</Text>

        {channel.description ? (
          <Text style={[st.channelDesc, { color: colors.textMuted }]}>{channel.description}</Text>
        ) : null}

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

        <View style={st.heroActions}>
          {isOwner ? (
            <TouchableOpacity
              style={[st.actionBtn, { backgroundColor: PURPLE }]}
              onPress={() => router.push({ pathname: "/channel/broadcast", params: { channelId: channel.id } } as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="megaphone" size={16} color="#fff" />
              <Text style={[st.actionBtnText, { color: "#fff" }]}>Broadcast</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                st.actionBtn,
                isSubscribed
                  ? { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border }
                  : { backgroundColor: PURPLE },
              ]}
              onPress={toggleSubscribe}
              disabled={subLoading}
              activeOpacity={0.8}
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
                  <Text style={[st.actionBtnText, { color: isSubscribed ? colors.textMuted : "#fff" }]}>
                    {isSubscribed ? "Subscribed" : "Subscribe"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {!isOwner && (
            <TouchableOpacity
              style={[st.giftBtn, { backgroundColor: "#FF2D5518", borderColor: "#FF2D5540" }]}
              onPress={() => { loadMyAcoin(); setGiftVisible(true); }}
              activeOpacity={0.8}
            >
              <Text style={st.giftEmoji}>🎁</Text>
              <Text style={[st.giftBtnText, { color: "#FF2D55" }]}>Gift</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[st.iconBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
            onPress={shareChannel}
            hitSlop={8}
          >
            <Ionicons name="share-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {channel.owner && (
        <TouchableOpacity
          style={[st.ownerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: channel.owner!.id } })}
          activeOpacity={0.75}
        >
          <Ionicons name="person-circle-outline" size={15} color={colors.textMuted} />
          <Text style={[st.ownerLabel, { color: colors.textMuted }]}>Channel by</Text>
          <Avatar uri={channel.owner.avatar_url} name={channel.owner.display_name} size={24} />
          <Text style={[st.ownerName, { color: colors.text }]}>{channel.owner.display_name}</Text>
          <VerifiedBadge isVerified={channel.owner.is_verified} size={14} />
          <Text style={[st.ownerHandle, { color: colors.textMuted }]}>@{channel.owner.handle}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: "auto" }} />
        </TouchableOpacity>
      )}

      <View style={[st.postsHeader, { borderBottomColor: colors.border }]}>
        <Ionicons name="megaphone-outline" size={15} color={PURPLE} />
        <Text style={[st.postsHeaderText, { color: colors.text }]}>Channel Posts</Text>
        {isOwner && (
          <TouchableOpacity
            style={[st.newPostBtn, { backgroundColor: PURPLE + "22" }]}
            onPress={() => router.push({ pathname: "/channel/broadcast", params: { channelId: channel.id } } as any)}
          >
            <Ionicons name="add" size={14} color={PURPLE} />
            <Text style={[st.newPostBtnText, { color: PURPLE }]}>New Post</Text>
          </TouchableOpacity>
        )}
      </View>

      {postsLoading && (
        <View style={{ padding: 32, alignItems: "center" }}>
          <ActivityIndicator color={PURPLE} />
        </View>
      )}
    </View>
  );

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary ?? colors.background }]}>
      <View style={[st.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.topBarBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.topBarTitle, { color: colors.text }]} numberOfLines={1}>{channel.name}</Text>
        <TouchableOpacity onPress={shareChannel} hitSlop={12} style={st.topBarBtn}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          !postsLoading ? (
            <View style={st.emptyPosts}>
              <Ionicons name="document-text-outline" size={44} color={colors.textMuted} />
              <Text style={[st.emptyPostsTitle, { color: colors.text }]}>No posts yet</Text>
              <Text style={[st.emptyPostsSub, { color: colors.textMuted }]}>
                {isOwner
                  ? "Tap Broadcast to post your first update to subscribers."
                  : "Subscribe to get notified when this channel publishes."}
              </Text>
              {isOwner && (
                <TouchableOpacity
                  style={[st.nfBtn, { backgroundColor: PURPLE }]}
                  onPress={() => router.push({ pathname: "/channel/broadcast", params: { channelId: channel.id } } as any)}
                >
                  <Text style={st.nfBtnText}>Broadcast Now</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAll(); }}
            tintColor={PURPLE}
          />
        }
      />

      {!isOwner && channel.owner && (
        <GiftPickerSheet
          visible={giftVisible}
          onClose={() => setGiftVisible(false)}
          onSend={sendGift}
          sending={giftSending}
          acoinBalance={myAcoin}
          recipientName={channel.name}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },

  hero: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 8,
  },
  heroAvatar: { position: "relative", marginBottom: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarGradient: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  verifiedBadge: { position: "absolute", bottom: 0, right: 0, backgroundColor: "#fff", borderRadius: 10, padding: 1 },

  channelName: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  channelDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },

  statsRow: { flexDirection: "row", alignItems: "center", gap: 16, marginVertical: 4 },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, height: 28, borderRadius: 1 },

  heroActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  giftBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  giftEmoji: { fontSize: 15 },
  giftBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

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
  ownerLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
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
  postsHeaderText: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  newPostBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  newPostBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  postCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  postImage: { width: "100%", height: 200 },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, padding: 14 },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  postAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  postActionCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  postTime: { fontSize: 11, fontFamily: "Inter_400Regular" },

  emptyPosts: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 40 },
  emptyPostsTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptyPostsSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  nfTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  nfSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  nfBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  nfBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
