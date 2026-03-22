import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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

  useEffect(() => {
    if (!id) return;
    supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, xp, current_grade, website_url, country")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setProfile(data as Profile);
        setLoading(false);
      });
  }, [id]);

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

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={Colors.brand} />
      </View>
    );
  }

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
        <View style={{ width: 24 }} />
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
          <TouchableOpacity style={styles.actionBtn}>
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
});
