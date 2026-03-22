import React, { useCallback, useEffect, useState } from "react";
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
  avatar_url: string | null;
  status: string;
  username: string;
  bio: string | null;
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
      .select("id, display_name, avatar_url, status, username, bio")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setProfile(data as Profile);
        setLoading(false);
      });
  }, [id]);

  async function startChat() {
    if (!user || !id) return;

    const { data: existing } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id);

    const existingIds = (existing || []).map((e: any) => e.conversation_id);

    if (existingIds.length > 0) {
      const { data: shared } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations!inner(id, is_group)")
        .eq("user_id", id)
        .in("conversation_id", existingIds)
        .eq("conversations.is_group", false);

      if (shared && shared.length > 0) {
        router.push({ pathname: "/chat/[id]", params: { id: shared[0].conversation_id } });
        return;
      }
    }

    const { data: conv } = await supabase
      .from("conversations")
      .insert({ is_group: false, last_message: "", last_message_at: new Date().toISOString() })
      .select()
      .single();

    if (conv) {
      await supabase.from("conversation_members").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: id },
      ]);
      router.push({ pathname: "/chat/[id]", params: { id: conv.id } });
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
        {/* Avatar + Name */}
        <View style={[styles.profileHeader, { backgroundColor: colors.surface }]}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={90} />
          <Text style={[styles.displayName, { color: colors.text }]}>
            {profile?.display_name}
          </Text>
          <Text style={[styles.username, { color: colors.textSecondary }]}>
            @{profile?.username}
          </Text>
          {profile?.status ? (
            <Text style={[styles.status, { color: colors.textSecondary }]}>{profile.status}</Text>
          ) : null}
          {profile?.bio ? (
            <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>
          ) : null}
        </View>

        {/* Actions */}
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
  displayName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  username: { fontSize: 14, fontFamily: "Inter_400Regular" },
  status: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  actionBtn: { alignItems: "center", gap: 8 },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
