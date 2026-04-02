import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Contacts from "expo-contacts";
import { MobileOnlyView } from "@/components/ui/MobileOnlyView";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/Avatar";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";
import Colors from "@/constants/colors";

type FoundContact = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  acoin: number;
  phone_number: string;
  phonebook_name: string;
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.length === 10) return "+1" + digits;
  return "+" + digits;
}

export default function PhoneContactsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [contacts, setContacts] = useState<FoundContact[]>([]);

  const findContacts = useCallback(async () => {
    setState("loading");

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") {
      setState("denied");
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });

    const phoneMap = new Map<string, string>();
    for (const contact of data) {
      const name = contact.name || "Unknown";
      for (const pn of contact.phoneNumbers || []) {
        if (pn.number) {
          const normalized = normalizePhone(pn.number);
          if (normalized.length >= 8) {
            phoneMap.set(normalized, name);
          }
        }
      }
    }

    const phones = Array.from(phoneMap.keys());
    if (phones.length === 0) { setState("done"); return; }

    const chunks: string[][] = [];
    for (let i = 0; i < phones.length; i += 100) chunks.push(phones.slice(i, i + 100));

    const allProfiles: any[] = [];
    for (const chunk of chunks) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, acoin, phone_number")
        .in("phone_number", chunk)
        .neq("id", user?.id || "");
      if (profiles) allProfiles.push(...profiles);
    }

    const found: FoundContact[] = allProfiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      handle: p.handle,
      avatar_url: p.avatar_url,
      acoin: p.acoin || 0,
      phone_number: p.phone_number,
      phonebook_name: phoneMap.get(p.phone_number) || p.display_name,
    }));

    setContacts(found);
    setState("done");
  }, [user]);

  useEffect(() => { findContacts(); }, [findContacts]);

  const renderItem = ({ item }: { item: FoundContact }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface }]}
      onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.id } })}
      activeOpacity={0.85}
    >
      <Avatar uri={item.avatar_url} name={item.display_name} size={48} />
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.displayName, { color: colors.text }]}>{item.display_name}</Text>
          <PrestigeBadge acoin={item.acoin} size="sm" />
        </View>
        <Text style={[styles.handle, { color: colors.textMuted }]}>@{item.handle}</Text>
        <Text style={[styles.phonebookName, { color: colors.textSecondary }]}>
          Saved as "{item.phonebook_name}"
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.msgBtn, { backgroundColor: colors.accent }]}
        onPress={async () => {
          const { data } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: item.id });
          if (data) router.push({ pathname: "/chat/[id]", params: { id: data } });
        }}
      >
        <Ionicons name="chatbubble" size={16} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (Platform.OS === "web") {
    return (
      <MobileOnlyView
        title="Contacts on AfuChat"
        description="Finding your phone contacts on AfuChat requires access to your native contacts list. This feature is only available on the AfuChat mobile app."
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Contacts on AfuChat</Text>
        <TouchableOpacity onPress={findContacts} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {state === "loading" && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Scanning your contacts…</Text>
        </View>
      )}

      {state === "denied" && (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Contacts Access Denied</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            Allow contacts permission to find your friends on AfuChat
          </Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.accent }]} onPress={findContacts}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "done" && contacts.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="person-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No contacts found</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            None of your phone contacts have joined AfuChat yet. Invite them!
          </Text>
        </View>
      )}

      {state === "done" && contacts.length > 0 && (
        <>
          <View style={[styles.foundBanner, { backgroundColor: colors.accent + "18" }]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            <Text style={[styles.foundText, { color: colors.accent }]}>
              Found {contacts.length} contact{contacts.length !== 1 ? "s" : ""} on AfuChat
            </Text>
          </View>
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 8 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  foundBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  foundText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  displayName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  phonebookName: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  msgBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
