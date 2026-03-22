import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";

type Profile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  xp: number;
  current_grade: string;
  website_url: string | null;
  country: string | null;
};

export default function ContactProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    if (!id || !user) return;
    supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, xp, current_grade, website_url, country")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setProfile(data as Profile);
        setLoading(false);
      });

    supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", id).maybeSingle().then(({ data }) => setIsFollowing(!!data));
    supabase.from("blocked_users").select("id").eq("blocker_id", user.id).eq("blocked_id", id).maybeSingle().then(({ data }) => setIsBlocked(!!data));
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", id).then(({ count }) => setFollowerCount(count || 0));
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", id).then(({ count }) => setFollowingCount(count || 0));
  }, [id, user]);

  async function startChat() {
    if (!user || !id) return;

    const { data: myChats } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", user.id);

    const myIds = (myChats || []).map((m: any) => m.chat_id);

    if (myIds.length > 0) {
      const { data: shared } = await supabase
        .from("chat_members")
        .select("chat_id, chats!inner(id, is_group, is_channel)")
        .eq("user_id", id)
        .in("chat_id", myIds)
        .eq("chats.is_group", false)
        .eq("chats.is_channel", false);

      if (shared && shared.length > 0) {
        router.push({ pathname: "/chat/[id]", params: { id: shared[0].chat_id } });
        return;
      }
    }

    const { data: chat } = await supabase
      .from("chats")
      .insert({ is_group: false, created_by: user.id, user_id: user.id })
      .select()
      .single();

    if (chat) {
      await supabase.from("chat_members").insert([
        { chat_id: chat.id, user_id: user.id },
        { chat_id: chat.id, user_id: id },
      ]);
      router.push({ pathname: "/chat/[id]", params: { id: chat.id } });
    }
  }

  async function toggleFollow() {
    if (!user || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", id);
      setIsFollowing(false);
      setFollowerCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: id });
      setIsFollowing(true);
      setFollowerCount((c) => c + 1);
    }
  }

  async function toggleBlock() {
    if (!user || !id) return;
    if (isBlocked) {
      await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", id);
      setIsBlocked(false);
    } else {
      Alert.alert("Block User", `Block ${profile?.display_name}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: async () => {
          await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: id });
          setIsBlocked(true);
          if (isFollowing) {
            await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", id);
            setIsFollowing(false);
          }
        }},
      ]);
    }
  }

  function reportUser() {
    if (!user || !id) return;
    Alert.alert("Report User", "Why are you reporting this user?", [
      { text: "Spam", onPress: () => submitReport("spam") },
      { text: "Harassment", onPress: () => submitReport("harassment") },
      { text: "Inappropriate Content", onPress: () => submitReport("inappropriate") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function submitReport(reason: string) {
    if (!user || !id) return;
    const { error } = await supabase.from("user_reports").insert({
      reporter_id: user.id,
      reported_id: id,
      reason,
    });
    if (error) Alert.alert("Error", "Could not submit report.");
    else Alert.alert("Reported", "Thank you for your report. We'll review it.");
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={Colors.brand} />
      </View>
    );
  }

  const isOwnProfile = user?.id === id;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        {!isOwnProfile ? (
          <TouchableOpacity onPress={reportUser}>
            <Ionicons name="flag-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        ) : <View style={{ width: 24 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.profileHeader, { backgroundColor: colors.surface }]}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={90} />
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.text }]}>
              {profile?.display_name}
            </Text>
            {profile?.is_verified && (
              <Ionicons name="checkmark-circle" size={18} color={Colors.brand} style={{ marginLeft: 6 }} />
            )}
          </View>
          <Text style={[styles.handle, { color: colors.textSecondary }]}>
            @{profile?.handle}
          </Text>
          {profile?.bio ? (
            <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>
          ) : null}

          <View style={styles.followStats}>
            <View style={styles.followStat}>
              <Text style={[styles.followNum, { color: colors.text }]}>{followerCount}</Text>
              <Text style={[styles.followLabel, { color: colors.textMuted }]}>Followers</Text>
            </View>
            <View style={[styles.followDivider, { backgroundColor: colors.border }]} />
            <View style={styles.followStat}>
              <Text style={[styles.followNum, { color: colors.text }]}>{followingCount}</Text>
              <Text style={[styles.followLabel, { color: colors.textMuted }]}>Following</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="flash" size={16} color="#FFD60A" />
              <Text style={[styles.infoValue, { color: colors.text }]}>{profile?.xp || 0} XP</Text>
            </View>
            <Text style={[styles.infoDot, { color: colors.textMuted }]}>{profile?.current_grade}</Text>
            {profile?.country ? (
              <Text style={[styles.infoDot, { color: colors.textMuted }]}>{profile.country}</Text>
            ) : null}
          </View>

          {!isOwnProfile && (
            <View style={styles.profileActions}>
              <TouchableOpacity style={[styles.followBtn, isFollowing && styles.followBtnActive]} onPress={toggleFollow}>
                <Ionicons name={isFollowing ? "checkmark" : "person-add-outline"} size={16} color={isFollowing ? Colors.brand : "#fff"} />
                <Text style={[styles.followBtnText, isFollowing && { color: Colors.brand }]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.blockBtn, isBlocked && styles.blockBtnActive]} onPress={toggleBlock}>
                <Ionicons name={isBlocked ? "ban" : "ban-outline"} size={16} color={isBlocked ? "#fff" : "#FF3B30"} />
                <Text style={[styles.blockBtnText, isBlocked && { color: "#fff" }]}>
                  {isBlocked ? "Blocked" : "Block"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.actions, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={startChat}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.brand }]}>
              <Ionicons name="chatbubble" size={22} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={[styles.actionIcon, { backgroundColor: "#007AFF" }]}>
              <Ionicons name="call" size={22} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={[styles.actionIcon, { backgroundColor: "#FF3B30" }]}>
              <Ionicons name="videocam" size={22} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push("/gifts")}>
            <View style={[styles.actionIcon, { backgroundColor: "#FF9500" }]}>
              <Ionicons name="gift" size={22} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Gift</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { gap: 12, paddingVertical: 12 },
  profileHeader: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 8,
  },
  nameRow: { flexDirection: "row", alignItems: "center" },
  displayName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  handle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4, lineHeight: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
  infoDot: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  actionBtn: { alignItems: "center", gap: 8 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  followStats: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 0 },
  followStat: { alignItems: "center", paddingHorizontal: 20 },
  followNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  followLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  followDivider: { width: StyleSheet.hairlineWidth, height: 30 },
  profileActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.brand, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 },
  followBtnActive: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.brand },
  followBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  blockBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#FF3B30", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24 },
  blockBtnActive: { backgroundColor: "#FF3B30" },
  blockBtnText: { color: "#FF3B30", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
