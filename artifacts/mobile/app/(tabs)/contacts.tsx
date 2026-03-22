import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
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
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";

type Contact = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  username: string;
};

type Section = { title: string; data: Contact[] };

function groupByLetter(contacts: Contact[]): Section[] {
  const map: Record<string, Contact[]> = {};
  contacts.forEach((c) => {
    const letter = c.display_name.charAt(0).toUpperCase();
    if (!map[letter]) map[letter] = [];
    map[letter].push(c);
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }));
}

function ContactRow({ item }: { item: Contact }) {
  const { colors } = useTheme();
  const { user } = useAuth();

  async function startChat() {
    Haptics.selectionAsync();
    if (!user) return;
    // Find or create conversation
    const { data: existing } = await supabase
      .from("conversation_members")
      .select("conversation_id, conversations!inner(id, is_group)")
      .eq("user_id", user.id);

    const existingIds = (existing || []).map((e: any) => e.conversation_id);

    if (existingIds.length > 0) {
      const { data: shared } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations!inner(id, is_group)")
        .eq("user_id", item.id)
        .in("conversation_id", existingIds)
        .eq("conversations.is_group", false);

      if (shared && shared.length > 0) {
        router.push({
          pathname: "/chat/[id]",
          params: { id: shared[0].conversation_id },
        });
        return;
      }
    }

    // Create new conversation
    const { data: conv } = await supabase
      .from("conversations")
      .insert({ is_group: false, last_message: "", last_message_at: new Date().toISOString() })
      .select()
      .single();

    if (conv) {
      await supabase.from("conversation_members").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: item.id },
      ]);
      router.push({ pathname: "/chat/[id]", params: { id: conv.id } });
    }
  }

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.surface }]}
      onPress={startChat}
      activeOpacity={0.7}
    >
      <Avatar uri={item.avatar_url} name={item.display_name} size={46} />
      <View style={styles.rowContent}>
        <Text style={[styles.name, { color: colors.text }]}>{item.display_name}</Text>
        <Text style={[styles.status, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.status || "@" + item.username}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function ContactsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResult, setAddResult] = useState<Contact | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("contacts")
      .select("contact_id, profiles!contacts_contact_id_fkey(id, display_name, avatar_url, status, username)")
      .eq("user_id", user.id)
      .eq("status", "accepted");

    if (data) {
      setContacts(
        data
          .map((c: any) => c.profiles)
          .filter(Boolean)
          .sort((a: Contact, b: Contact) => a.display_name.localeCompare(b.display_name))
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  async function searchUser() {
    if (!addQuery.trim()) return;
    setAddLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, status, username")
      .or(`username.ilike.%${addQuery.trim()}%,display_name.ilike.%${addQuery.trim()}%`)
      .neq("id", user?.id)
      .limit(1)
      .single();
    setAddResult(data as Contact | null);
    setAddLoading(false);
  }

  async function sendFriendRequest() {
    if (!addResult || !user) return;
    await supabase.from("contacts").upsert({
      user_id: user.id,
      contact_id: addResult.id,
      status: "pending",
    });
    await supabase.from("contacts").upsert({
      user_id: addResult.id,
      contact_id: user.id,
      status: "accepted",
    });
    setAdding(false);
    setAddQuery("");
    setAddResult(null);
    loadContacts();
  }

  const filtered = search
    ? contacts.filter(
        (c) =>
          c.display_name.toLowerCase().includes(search.toLowerCase()) ||
          c.username.toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  const sections = groupByLetter(filtered);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Contacts</Text>
        <TouchableOpacity
          onPress={() => setAdding(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="person-add-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.surface }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search contacts"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Add Contact Modal */}
      {adding && (
        <View style={[styles.addModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.addHeader}>
            <Text style={[styles.addTitle, { color: colors.text }]}>Add Contact</Text>
            <TouchableOpacity onPress={() => { setAdding(false); setAddResult(null); setAddQuery(""); }}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={[styles.addField, { backgroundColor: colors.inputBg }]}>
            <TextInput
              style={[styles.addInput, { color: colors.text }]}
              placeholder="Search by username or name"
              placeholderTextColor={colors.textMuted}
              value={addQuery}
              onChangeText={setAddQuery}
              onSubmitEditing={searchUser}
              autoFocus
            />
            <TouchableOpacity onPress={searchUser}>
              <Ionicons name="search" size={18} color={Colors.brand} />
            </TouchableOpacity>
          </View>
          {addLoading && <ActivityIndicator color={Colors.brand} style={{ marginTop: 12 }} />}
          {addResult && (
            <View style={styles.addResultRow}>
              <Avatar uri={addResult.avatar_url} name={addResult.display_name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{addResult.display_name}</Text>
                <Text style={[styles.status, { color: colors.textSecondary }]}>@{addResult.username}</Text>
              </View>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={sendFriendRequest}
              >
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          )}
          {!addLoading && addQuery && !addResult && (
            <Text style={[styles.noResult, { color: colors.textMuted }]}>No user found</Text>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No contacts yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Tap the + icon to add friends
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ContactRow item={item} />}
          renderSectionHeader={({ section: { title } }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <Separator indent={74} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadContacts(); }}
              tintColor={Colors.brand}
            />
          }
          contentContainerStyle={{ paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
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
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 36 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  rowContent: { flex: 1 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  status: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  addModal: {
    margin: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  addHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  addTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  addField: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  addInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  addResultRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  addBtn: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  noResult: { textAlign: "center", fontFamily: "Inter_400Regular" },
});
