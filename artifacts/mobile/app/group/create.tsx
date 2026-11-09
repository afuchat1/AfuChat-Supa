import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";
import { isOnline } from "@/lib/offlineStore";
import { TIER_GROUP_LIMITS } from "@/lib/featureUsage";
import { checkPublicChatUsername } from "@/lib/usernameAvailability";

type FollowedUser = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified?: boolean;
  is_organization_verified?: boolean;
};
type HandleStatus = "idle" | "checking" | "available" | "taken" | "invalid_format" | "error";

export default function CreateGroupScreen() {
  const { colors } = useTheme();
  const { user, subscription } = useAuth();
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName] = useState("");
  const [groupHandle, setGroupHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<HandleStatus>("idle");
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadFollowing = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("follows")
        .select("following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified)")
        .eq("follower_id", user.id);

      if (data) {
        setFollowedUsers(
          data.map((f: any) => f.profiles).filter(Boolean)
        );
      }
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadFollowing(); }, [loadFollowing]);

  useEffect(() => {
    const normalized = groupHandle.trim().toLowerCase();
    if (!normalized) {
      setHandleStatus("idle");
      return;
    }
    if (normalized.length < 3) {
      setHandleStatus("invalid_format");
      return;
    }
    let active = true;
    setHandleStatus("checking");
    const timer = setTimeout(() => {
      void checkPublicChatUsername(normalized).then((result) => {
        if (active) setHandleStatus(result?.status ?? "error");
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [groupHandle]);

  function toggleSelect(id: string) {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createGroup() {
    if (!isOnline()) {
      showAlert("No internet", "Creating a group requires an internet connection.");
      return;
    }
    const tier = (subscription?.plan_tier as keyof typeof TIER_GROUP_LIMITS) || "free";
    const limit = TIER_GROUP_LIMITS[tier] ?? 1;
    if (isFinite(limit)) {
      const { data: currentCount } = await supabase.rpc("count_my_groups");
      const current = Number(currentCount ?? 0);
      if (current >= limit) {
        const nextTier = tier === "free" ? "Silver" : tier === "silver" ? "Gold" : "Platinum";
        showAlert(
          "Group limit reached",
          `You can create up to ${limit} group${limit === 1 ? "" : "s"} on your current plan. Upgrade to ${nextTier} to create more.`,
          [
            { text: `Upgrade to ${nextTier}`, onPress: () => router.push("/premium") },
            { text: "OK" },
          ]
        );
        setCreating(false);
        return;
      }
    }
    if (!groupName.trim()) {
      showAlert("Group name required", "Please enter a group name.");
      return;
    }
    const normalizedHandle = groupHandle.trim().toLowerCase();
    if (!normalizedHandle) {
      showAlert("Username required", "Public groups need a username so people can find and share them.");
      return;
    }
    const availability = await checkPublicChatUsername(normalizedHandle);
    if (!availability || availability.status !== "available") {
      showAlert(
        availability?.status === "invalid_format" ? "Invalid username" : "Username unavailable",
        availability?.status === "invalid_format"
          ? "Use 3–30 lowercase letters, numbers, or underscores."
          : "That username is already used or owned on AfuChat. Please choose another."
      );
      return;
    }
    if (selected.size < 1) {
      showAlert("Add members", "Select at least 1 contact.");
      return;
    }
    if (!user) return;
    setCreating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { data: chatId, error: createError } = await supabase.rpc("create_group_chat", {
      p_name: groupName.trim(),
      p_handle: normalizedHandle,
      p_member_ids: Array.from(selected),
    });

    if (createError || !chatId) {
      const message = createError?.message?.toLowerCase() || "";
      showAlert(
        message.includes("username") || message.includes("duplicate") ? "Username unavailable" : "Could not create group",
        message.includes("username") || message.includes("duplicate")
          ? "That username is already used or owned on AfuChat. Please choose another."
          : "Please try again."
      );
      setCreating(false);
      return;
    }

    if (chatId) {
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("group_created"); } catch (_) {}
      router.replace({ pathname: "/chat/[id]", params: { id: chatId, chatName: groupName.trim(), chatHandle: normalizedHandle } });
    }
    setCreating(false);
  }

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background }]} behavior="padding" keyboardVerticalOffset={0}>
      <GlassHeader
        title="New Group"
        onBack={() => router.back()}
        right={
          <TouchableOpacity onPress={createGroup} disabled={creating}>
            {creating ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={[styles.createText, { color: colors.accent }]}>Create</Text>}
          </TouchableOpacity>
        }
      />

      <View style={[styles.nameRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.groupIconWrap, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="camera" size={20} color={colors.textMuted} />
        </View>
        <View style={styles.nameInputWrap}>
          <TextInput
            style={[styles.nameInput, { color: colors.text }]}
            placeholder="Group name"
            placeholderTextColor={colors.textMuted}
            value={groupName}
            onChangeText={setGroupName}
            autoFocus
          />
          <TextInput
            style={[styles.handleInput, { color: colors.text, borderBottomColor: colors.accent }]}
            placeholder="Public group username"
            placeholderTextColor={colors.textMuted}
            value={groupHandle}
            onChangeText={(value) => setGroupHandle(value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
          {groupHandle.trim() ? (
            <Text style={[styles.handleStatus, {
              color: handleStatus === "available" ? "#34C759" : handleStatus === "taken" || handleStatus === "invalid_format" ? "#FF3B30" : colors.textMuted,
            }]}>
              {handleStatus === "checking" ? "Checking username…" :
                handleStatus === "available" ? "Username available" :
                handleStatus === "taken" ? "Username already used or owned" :
                handleStatus === "invalid_format" ? "Use at least 3 letters, numbers, or underscores" :
                handleStatus === "error" ? "Could not check username yet" : ""}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.memberCount, { backgroundColor: colors.backgroundSecondary }]}>
        <Text style={[styles.memberCountText, { color: colors.textSecondary }]}>
          {selected.size} selected from your contacts
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: 8 }}>{[1,2,3,4,5].map(i => <ContactRowSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={followedUsers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.contactRow, { backgroundColor: colors.surface }]}
                onPress={() => toggleSelect(item.id)}
                activeOpacity={0.7}
              >
                <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[styles.contactName, { color: colors.text }]}>{item.display_name}</Text>
                    <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={13} />
                  </View>
                  <Text style={[styles.contactHandle, { color: colors.textMuted }]}>@{item.handle}</Text>
                </View>
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: isSelected ? colors.accent : colors.border },
                    isSelected && { backgroundColor: colors.accent },
                  ]}
                >
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Follow people first to add them to a group
              </Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    
  },
  cancelText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  createText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  groupIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  nameInput: { flex: 1, fontSize: 17, fontFamily: "Inter_400Regular" },
  nameInputWrap: { flex: 1 },
  handleInput: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    padding: 0,
    paddingTop: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
  },
  handleStatus: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    paddingTop: 4,
  },
  memberCount: { paddingHorizontal: 16, paddingVertical: 8 },
  memberCountText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  contactName: { fontSize: 16, fontFamily: "Inter_400Regular" },
  contactHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 24 },
});
