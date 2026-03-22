import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";

type Contact = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export default function CreateGroupScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("contacts")
      .select("contact_id, profiles!contacts_contact_id_fkey(id, display_name, avatar_url)")
      .eq("user_id", user.id)
      .eq("status", "accepted");

    if (data) {
      setContacts(
        data.map((c: any) => c.profiles).filter(Boolean)
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

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
    if (!groupName.trim()) {
      Alert.alert("Group name required", "Please enter a group name.");
      return;
    }
    if (selected.size < 2) {
      Alert.alert("Add members", "Select at least 2 contacts.");
      return;
    }
    if (!user) return;
    setCreating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { data: conv } = await supabase
      .from("conversations")
      .insert({
        is_group: true,
        group_name: groupName.trim(),
        last_message: "",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (conv) {
      const members = [user.id, ...Array.from(selected)].map((uid) => ({
        conversation_id: conv.id,
        user_id: uid,
      }));
      await supabase.from("conversation_members").insert(members);
      router.replace({ pathname: "/chat/[id]", params: { id: conv.id } });
    }
    setCreating(false);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Group</Text>
        <TouchableOpacity onPress={createGroup} disabled={creating}>
          {creating ? (
            <ActivityIndicator color={Colors.brand} />
          ) : (
            <Text style={[styles.createText, { color: Colors.brand }]}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Group Name */}
      <View style={[styles.nameRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.groupIconWrap, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="camera-outline" size={20} color={colors.textMuted} />
        </View>
        <TextInput
          style={[styles.nameInput, { color: colors.text }]}
          placeholder="Group name"
          placeholderTextColor={colors.textMuted}
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
        />
      </View>

      {/* Selected count */}
      <View style={[styles.memberCount, { backgroundColor: colors.backgroundSecondary }]}>
        <Text style={[styles.memberCountText, { color: colors.textSecondary }]}>
          {selected.size} selected
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={contacts}
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
                <Text style={[styles.contactName, { color: colors.text }]}>
                  {item.display_name}
                </Text>
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: isSelected ? Colors.brand : colors.border },
                    isSelected && { backgroundColor: Colors.brand },
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
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No contacts to add
              </Text>
            </View>
          }
        />
      )}
    </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  createText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  nameInput: { flex: 1, fontSize: 17, fontFamily: "Inter_400Regular" },
  memberCount: { paddingHorizontal: 16, paddingVertical: 8 },
  memberCountText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  contactName: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
