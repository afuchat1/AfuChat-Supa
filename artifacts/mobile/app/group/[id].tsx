import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { supabase } from "@/lib/supabase";
import { uploadToStorage } from "@/lib/mediaUpload";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { showAlert } from "@/lib/alert";
import { isOnline } from "@/lib/offlineStore";
import * as Haptics from "@/lib/haptics";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
};

type Member = {
  user_id: string;
  is_admin: boolean;
  profile: MemberProfile;
};

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  is_group: boolean;
  is_channel: boolean;
  is_public: boolean;
  created_by: string;
};

type Follower = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
};

// ─── Bottom sheet ─────────────────────────────────────────────────────────────

function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={bs.overlay} activeOpacity={1} onPress={onClose} />
      <View style={bs.sheet}>{children}</View>
    </Modal>
  );
}

const bs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 6,
    paddingBottom: 40,
    maxHeight: "80%",
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GroupManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [iAmAdmin, setIAmAdmin] = useState(false);
  const [isCreator, setIsCreator] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editField, setEditField] = useState<"name" | "description">("name");
  const [editValue, setEditValue] = useState("");

  // Member action sheet
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showMemberSheet, setShowMemberSheet] = useState(false);

  // Add members sheet
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addCandidates, setAddCandidates] = useState<Follower[]>([]);
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [addLoading, setAddLoading] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  const sheetBg = isDark ? "#1C1C1E" : "#fff";
  const sheetBorder = isDark ? "#2C2C2E" : "#E5E5EA";

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadGroup = useCallback(async () => {
    if (!id || !user) return;
    const [{ data: chatData }, { data: membersData }] = await Promise.all([
      supabase
        .from("chats")
        .select("id, name, description, avatar_url, is_group, is_channel, is_public, created_by")
        .eq("id", id)
        .single(),
      supabase
        .from("chat_members")
        .select(
          "user_id, is_admin, profiles!chat_members_user_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified)"
        )
        .eq("chat_id", id),
    ]);

    if (chatData) {
      setGroup({
        ...chatData,
        is_public: (chatData as any).is_public ?? false,
      });
      setIsCreator(chatData.created_by === user.id);
    }

    if (membersData) {
      const mapped: Member[] = (membersData as any[]).map((m) => {
        const raw = m.profiles;
        const profile: MemberProfile = Array.isArray(raw)
          ? raw[0]
          : raw || {
              id: m.user_id,
              display_name: "Unknown",
              handle: "",
              avatar_url: null,
              is_verified: false,
              is_organization_verified: false,
            };
        return { user_id: m.user_id, is_admin: m.is_admin ?? false, profile };
      });
      setMembers(mapped);
      const me = mapped.find((m) => m.user_id === user.id);
      setIAmAdmin(me?.is_admin ?? false);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  // ── Avatar change ───────────────────────────────────────────────────────────

  async function changeAvatar() {
    if (!iAmAdmin) return;
    if (!isOnline()) {
      showAlert("No internet", "An internet connection is required to change the photo.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission required", "Allow photo library access to change the group photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0] || !user) return;

    setSaving(true);
    try {
      const uri = result.assets[0].uri;
      const ext = uri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
      const fileName = `group-${id}-${Date.now()}.${ext}`;
      const { publicUrl } = await uploadToStorage(
        "group-avatars",
        `${user.id}/${fileName}`,
        uri,
        `image/${ext === "png" ? "png" : "jpeg"}`
      );
      await supabase.from("chats").update({ avatar_url: publicUrl }).eq("id", id);
      setGroup((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showAlert("Error", "Could not upload photo. Please try again.");
    }
    setSaving(false);
  }

  // ── Edit name / description ─────────────────────────────────────────────────

  function openEdit(field: "name" | "description") {
    setEditField(field);
    setEditValue(
      field === "name" ? group?.name ?? "" : group?.description ?? ""
    );
    setShowEditModal(true);
  }

  async function saveEdit() {
    if (!isOnline()) {
      showAlert("No internet", "An internet connection is required to save changes.");
      return;
    }
    if (editField === "name" && !editValue.trim()) {
      showAlert("Name required", "Please enter a name.");
      return;
    }
    setSaving(true);
    const update =
      editField === "name"
        ? { name: editValue.trim() }
        : { description: editValue.trim() || null };
    await supabase.from("chats").update(update).eq("id", id);
    setGroup((prev) =>
      prev ? { ...prev, ...update } : prev
    );
    setShowEditModal(false);
    setSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ── Visibility toggle ───────────────────────────────────────────────────────

  async function togglePublic(val: boolean) {
    if (!iAmAdmin) return;
    if (!isOnline()) {
      showAlert("No internet", "An internet connection is required.");
      return;
    }
    await supabase.from("chats").update({ is_public: val }).eq("id", id);
    setGroup((prev) => (prev ? { ...prev, is_public: val } : prev));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  // ── Share invite link ───────────────────────────────────────────────────────

  async function shareInviteLink() {
    const name = group?.name ?? "group";
    const link = `https://afuchat.app/join/${id}`;
    try {
      await Share.share({
        message: `Join "${name}" on AfuChat:\n${link}`,
        url: link,
        title: `Join ${name} on AfuChat`,
      });
    } catch {}
  }

  // ── Member management ───────────────────────────────────────────────────────

  async function removeMember(memberId: string, memberName: string) {
    setShowMemberSheet(false);
    if (!iAmAdmin || !isOnline()) return;
    Alert.alert(
      "Remove member",
      `Remove ${memberName} from this ${isChannel ? "channel" : "group"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("chat_members")
              .delete()
              .eq("chat_id", id)
              .eq("user_id", memberId);
            setMembers((prev) => prev.filter((m) => m.user_id !== memberId));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  }

  async function toggleAdminRole(member: Member) {
    setShowMemberSheet(false);
    if (!iAmAdmin || !isOnline()) return;
    const newVal = !member.is_admin;
    await supabase
      .from("chat_members")
      .update({ is_admin: newVal })
      .eq("chat_id", id)
      .eq("user_id", member.user_id);
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === member.user_id ? { ...m, is_admin: newVal } : m
      )
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function leaveGroup() {
    if (!user || !isOnline()) return;
    const type = isChannel ? "channel" : "group";
    Alert.alert(
      `Leave ${type}`,
      `Are you sure you want to leave "${group?.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("chat_members")
              .delete()
              .eq("chat_id", id)
              .eq("user_id", user.id);
            router.replace("/(tabs)/index");
          },
        },
      ]
    );
  }

  async function deleteGroup() {
    if (!isCreator || !isOnline()) return;
    const type = isChannel ? "channel" : "group";
    Alert.alert(
      `Delete ${type}`,
      `This will permanently delete "${group?.name}" and all its messages. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            await supabase.from("chats").delete().eq("id", id);
            router.replace("/(tabs)/index");
          },
        },
      ]
    );
  }

  // ── Add members ─────────────────────────────────────────────────────────────

  async function openAddMembers() {
    if (!iAmAdmin || !user) return;
    setAddLoading(true);
    setShowAddSheet(true);
    setAddSelected(new Set());

    const existingIds = new Set(members.map((m) => m.user_id));
    const { data } = await supabase
      .from("follows")
      .select(
        "following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified)"
      )
      .eq("follower_id", user.id);

    const candidates: Follower[] = ((data || []) as any[])
      .map((f) => f.profiles)
      .filter(Boolean)
      .filter((p: any) => !existingIds.has(p.id))
      .map((p: any) => ({
        id: p.id,
        display_name: p.display_name || "Unknown",
        handle: p.handle || "",
        avatar_url: p.avatar_url || null,
        is_verified: !!p.is_verified,
        is_organization_verified: !!p.is_organization_verified,
      }));

    setAddCandidates(candidates);
    setAddLoading(false);
  }

  async function confirmAddMembers() {
    if (addSelected.size === 0 || !isOnline()) return;
    setAddSaving(true);
    const newMembers = Array.from(addSelected).map((uid) => ({
      chat_id: id,
      user_id: uid,
      is_admin: false,
    }));
    await supabase.from("chat_members").insert(newMembers);
    setShowAddSheet(false);
    await loadGroup();
    setAddSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const isChannel = group?.is_channel ?? false;
  const typeLabel = isChannel ? "Channel" : "Group";
  const memberCount = members.length;
  const admins = members.filter((m) => m.is_admin);
  const nonAdmins = members.filter((m) => !m.is_admin);
  const sortedMembers = [...admins, ...nonAdmins];
  const iAmMember = members.some((m) => m.user_id === user?.id);

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <GlassHeader title={`${typeLabel} Info`} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <GlassHeader title="Not found" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.textMuted }}>Group not found</Text>
        </View>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <GlassHeader title={`${typeLabel} Info`} right={saving ? <ActivityIndicator color={colors.accent} size="small" /> : undefined} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* ── Avatar + Name + Stats ─── */}
        <View style={[s.heroSection, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            onPress={iAmAdmin ? changeAvatar : undefined}
            activeOpacity={iAmAdmin ? 0.7 : 1}
            style={s.avatarWrap}
          >
            {group.avatar_url ? (
              <Image source={{ uri: group.avatar_url }} style={s.avatarImg} />
            ) : (
              <View style={[s.avatarPlaceholder, { backgroundColor: colors.accent + "22" }]}>
                <Ionicons
                  name={isChannel ? "megaphone" : "people"}
                  size={40}
                  color={colors.accent}
                />
              </View>
            )}
            {iAmAdmin && (
              <View style={[s.cameraOverlay, { backgroundColor: colors.accent }]}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          <View style={s.heroInfo}>
            <TouchableOpacity
              onPress={iAmAdmin ? () => openEdit("name") : undefined}
              activeOpacity={iAmAdmin ? 0.6 : 1}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={[s.heroName, { color: colors.text }]} numberOfLines={2}>
                {group.name}
              </Text>
              {iAmAdmin && (
                <Ionicons name="pencil" size={15} color={colors.textMuted} />
              )}
            </TouchableOpacity>
            <Text style={[s.heroSub, { color: colors.textMuted }]}>
              {typeLabel} · {memberCount} {isChannel ? "subscriber" : "member"}{memberCount !== 1 ? "s" : ""}
            </Text>
            {group.is_public && (
              <View style={[s.publicBadge, { backgroundColor: colors.accent + "18" }]}>
                <Ionicons name="earth" size={11} color={colors.accent} />
                <Text style={[s.publicBadgeText, { color: colors.accent }]}>Public</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Description ─── */}
        <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Description</Text>
            {iAmAdmin && (
              <TouchableOpacity onPress={() => openEdit("description")} hitSlop={12}>
                <Ionicons name="pencil-outline" size={16} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={[s.descText, { color: group.description ? colors.text : colors.textMuted }]}>
            {group.description || (iAmAdmin ? "Tap the pencil to add a description" : "No description")}
          </Text>
        </View>

        {/* ── Quick actions ─── */}
        <View style={[s.actionsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={s.actionBtn} onPress={shareInviteLink} activeOpacity={0.7}>
            <View style={[s.actionIconWrap, { backgroundColor: "#007AFF18" }]}>
              <Ionicons name="share-social-outline" size={22} color="#007AFF" />
            </View>
            <Text style={[s.actionLabel, { color: colors.text }]}>Share</Text>
          </TouchableOpacity>

          {iAmAdmin && (
            <TouchableOpacity style={s.actionBtn} onPress={openAddMembers} activeOpacity={0.7}>
              <View style={[s.actionIconWrap, { backgroundColor: colors.accent + "18" }]}>
                <Ionicons name="person-add-outline" size={22} color={colors.accent} />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>Add</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id } })}
            activeOpacity={0.7}
          >
            <View style={[s.actionIconWrap, { backgroundColor: "#34C75918" }]}>
              <Ionicons name="chatbubble-outline" size={22} color="#34C759" />
            </View>
            <Text style={[s.actionLabel, { color: colors.text }]}>Open Chat</Text>
          </TouchableOpacity>
        </View>

        {/* ── Visibility (admin only) ─── */}
        {iAmAdmin && (
          <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Visibility</Text>
            <View style={s.settingRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.settingLabel, { color: colors.text }]}>Public {typeLabel}</Text>
                <Text style={[s.settingHint, { color: colors.textMuted }]}>
                  Anyone can discover and join this {typeLabel.toLowerCase()} through search
                </Text>
              </View>
              <Switch
                value={group.is_public}
                onValueChange={togglePublic}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        {/* ── Members ─── */}
        <View style={{ marginTop: 16 }}>
          <View style={[s.sectionHeader, { paddingHorizontal: 16, paddingBottom: 8 }]}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
              {isChannel ? "SUBSCRIBERS" : "MEMBERS"} ({memberCount})
            </Text>
          </View>

          <View style={[s.membersCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {sortedMembers.map((member, index) => {
              const isMe = member.user_id === user?.id;
              const isLast = index === sortedMembers.length - 1;
              return (
                <TouchableOpacity
                  key={member.user_id}
                  style={[
                    s.memberRow,
                    !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  onPress={() => {
                    if (isMe || !iAmAdmin) {
                      router.push({
                        pathname: "/contact/[id]",
                        params: { id: member.profile.id || member.user_id },
                      });
                    } else {
                      setSelectedMember(member);
                      setShowMemberSheet(true);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Avatar
                    uri={member.profile.avatar_url}
                    name={member.profile.display_name}
                    size={44}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={[s.memberName, { color: colors.text }]} numberOfLines={1}>
                        {member.profile.display_name || "Unknown"}
                        {isMe ? " (you)" : ""}
                      </Text>
                      <VerifiedBadge
                        isVerified={member.profile.is_verified}
                        isOrganizationVerified={member.profile.is_organization_verified}
                        size={13}
                      />
                    </View>
                    <Text style={[s.memberHandle, { color: colors.textMuted }]}>
                      @{member.profile.handle || "unknown"}
                    </Text>
                  </View>
                  {member.is_admin && (
                    <View style={[s.adminBadge, { backgroundColor: colors.accent + "18" }]}>
                      <Text style={[s.adminBadgeText, { color: colors.accent }]}>
                        {isCreator && member.user_id === group.created_by ? "Owner" : "Admin"}
                      </Text>
                    </View>
                  )}
                  {iAmAdmin && !isMe && (
                    <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Danger zone ─── */}
        <View style={{ marginTop: 24, paddingHorizontal: 16, gap: 12 }}>
          {iAmMember && !isCreator && (
            <TouchableOpacity
              style={[s.dangerBtn, { borderColor: "#FF3B30" }]}
              onPress={leaveGroup}
              activeOpacity={0.7}
            >
              <Ionicons name="exit-outline" size={18} color="#FF3B30" />
              <Text style={[s.dangerBtnText, { color: "#FF3B30" }]}>
                Leave {typeLabel}
              </Text>
            </TouchableOpacity>
          )}
          {isCreator && (
            <TouchableOpacity
              style={[s.dangerBtn, { borderColor: "#FF3B30" }]}
              onPress={deleteGroup}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color="#FF3B30" />
              <Text style={[s.dangerBtnText, { color: "#FF3B30" }]}>
                Delete {typeLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ── Edit Name / Description modal ─── */}
      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          activeOpacity={1}
          onPress={() => setShowEditModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: "100%",
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 20,
              gap: 14,
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>
              Edit {editField === "name" ? "Name" : "Description"}
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                fontSize: 15,
                fontFamily: "Inter_400Regular",
                color: colors.text,
                backgroundColor: colors.inputBg,
                minHeight: editField === "description" ? 80 : 48,
              }}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={editField === "name" ? "Group name" : "Description (optional)"}
              placeholderTextColor={colors.textMuted}
              autoFocus
              multiline={editField === "description"}
              maxLength={editField === "name" ? 80 : 300}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={{ color: colors.text, fontFamily: "Inter_500Medium", fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, height: 44, borderRadius: 10, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
                onPress={saveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Member action sheet ─── */}
      <BottomSheet visible={showMemberSheet} onClose={() => setShowMemberSheet(false)}>
        <View style={{ backgroundColor: sheetBg, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
          {selectedMember && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: sheetBorder }}>
                <Avatar
                  uri={selectedMember.profile.avatar_url}
                  name={selectedMember.profile.display_name}
                  size={44}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                    {selectedMember.profile.display_name}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>@{selectedMember.profile.handle}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}
                onPress={() => {
                  setShowMemberSheet(false);
                  router.push({ pathname: "/contact/[id]", params: { id: selectedMember.profile.id } });
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#007AFF18", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-outline" size={18} color="#007AFF" />
                </View>
                <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.text }}>View Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}
                onPress={() => toggleAdminRole(selectedMember)}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={selectedMember.is_admin ? "shield-outline" : "shield"} size={18} color={colors.accent} />
                </View>
                <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.text }}>
                  {selectedMember.is_admin ? "Remove Admin" : "Make Admin"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}
                onPress={() => removeMember(selectedMember.user_id, selectedMember.profile.display_name)}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FF3B3018", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-remove-outline" size={18} color="#FF3B30" />
                </View>
                <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: "#FF3B30" }}>Remove from {typeLabel}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </BottomSheet>

      {/* ── Add members sheet ─── */}
      <BottomSheet visible={showAddSheet} onClose={() => { if (!addSaving) setShowAddSheet(false); }}>
        <View style={{ backgroundColor: sheetBg, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: sheetBorder }}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>
              Add Members
            </Text>
            <TouchableOpacity
              style={[
                { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14 },
                { backgroundColor: addSelected.size > 0 ? colors.accent : colors.inputBg },
              ]}
              onPress={confirmAddMembers}
              disabled={addSaving || addSelected.size === 0}
            >
              {addSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: addSelected.size > 0 ? "#fff" : colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                  Add {addSelected.size > 0 ? `(${addSelected.size})` : ""}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {addLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : addCandidates.length === 0 ? (
            <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
              <Ionicons name="people-outline" size={40} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                All your contacts are already in this {typeLabel.toLowerCase()}
              </Text>
            </View>
          ) : (
            <FlatList
              data={addCandidates}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => {
                const sel = addSelected.has(item.id);
                return (
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setAddSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.text }} numberOfLines={1}>
                          {item.display_name}
                        </Text>
                        <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={13} />
                      </View>
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>@{item.handle}</Text>
                    </View>
                    <View style={[
                      { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
                      sel ? { backgroundColor: colors.accent, borderColor: colors.accent } : { borderColor: colors.border },
                    ]}>
                      {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },

  heroSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
    marginBottom: 2,
  },
  avatarWrap: { position: "relative" },
  avatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  heroInfo: { flex: 1, gap: 4 },
  heroName: { fontSize: 20, fontFamily: "Inter_700Bold", flexShrink: 1 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  publicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 2,
  },
  publicBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  section: {
    marginTop: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  descText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },

  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 16,
    marginTop: 2,
    paddingHorizontal: 24,
  },
  actionBtn: { alignItems: "center", gap: 6 },
  actionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  settingLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  settingHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  membersCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
  },
  memberName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  memberHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  adminBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  dangerBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
