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
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
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

    const { data: myChats } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", user.id);

    const myIds = (myChats || []).map((m: any) => m.chat_id);

    if (myIds.length > 0) {
      const { data: shared } = await supabase
        .from("chat_members")
        .select("chat_id, chats!inner(id, is_group, is_channel)")
        .eq("user_id", item.id)
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
      .insert({
        is_group: false,
        created_by: user.id,
        user_id: user.id,
      })
      .select()
      .single();

    if (chat) {
      await supabase.from("chat_members").insert([
        { chat_id: chat.id, user_id: user.id },
        { chat_id: chat.id, user_id: item.id },
      ]);
      router.push({ pathname: "/chat/[id]", params: { id: chat.id } });
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
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]}>{item.display_name}</Text>
          {item.is_verified && (
            <Ionicons name="checkmark-circle" size={14} color={Colors.brand} style={{ marginLeft: 4 }} />
          )}
        </View>
        <Text style={[styles.handle, { color: colors.textSecondary }]} numberOfLines={1}>
          @{item.handle}
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

    const { data: followRows } = await supabase
      .from("follows")
      .select("following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url, bio, is_verified)")
      .eq("follower_id", user.id);

    if (followRows) {
      const list = followRows
        .map((f: any) => f.profiles)
        .filter(Boolean)
        .sort((a: Contact, b: Contact) => a.display_name.localeCompare(b.display_name));
      setContacts(list);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  async function searchUser() {
    if (!addQuery.trim()) return;
    setAddLoading(true);
    setAddResult(null);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified")
      .or(`handle.ilike.%${addQuery.trim()}%,display_name.ilike.%${addQuery.trim()}%`)
      .neq("id", user?.id)
      .limit(1)
      .single();
    setAddResult(data as Contact | null);
    setAddLoading(false);
  }

  async function followUser() {
    if (!addResult || !user) return;
    await supabase.from("follows").upsert({
      follower_id: user.id,
      following_id: addResult.id,
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
          c.handle.toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  const sections = groupByLetter(filtered);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
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
              placeholder="Search by handle or name"
              placeholderTextColor={colors.textMuted}
              value={addQuery}
              onChangeText={setAddQuery}
              onSubmitEditing={searchUser}
              autoFocus
              autoCapitalize="none"
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
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: colors.text }]}>{addResult.display_name}</Text>
                  {addResult.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color={Colors.brand} style={{ marginLeft: 4 }} />
                  )}
                </View>
                <Text style={[styles.handle, { color: colors.textSecondary }]}>@{addResult.handle}</Text>
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={followUser}>
                <Text style={styles.addBtnText}>Follow</Text>
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
            Tap the + icon to find and follow people
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
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 6 },
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
