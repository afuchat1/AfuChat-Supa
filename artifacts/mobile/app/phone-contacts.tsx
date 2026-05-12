import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Share,
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
import { saveAllPhonebookNames } from "@/lib/storage/localContacts";

type AfuContact = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  acoin: number;
  phone_number: string;
  phonebook_name: string;
};

type NonAfuContact = {
  name: string;
  phone: string;
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.length === 10) return "+1" + digits;
  return "+" + digits;
}

const INVITE_MSG =
  "Hey! I'm using AfuChat — the social super app for chatting, discovering content, and connecting with people. Join me here: https://afuchat.com";

async function sendInvite(name: string, phone: string) {
  if (Platform.OS !== "web") {
    try {
      const smsUrl = `sms:${phone}${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(INVITE_MSG)}`;
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (canOpen) {
        await Linking.openURL(smsUrl);
        return;
      }
    } catch {}
  }
  await Share.share({ message: INVITE_MSG, title: "Join AfuChat" });
}

export default function PhoneContactsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [onAfuChat, setOnAfuChat] = useState<AfuContact[]>([]);
  const [notOnAfuChat, setNotOnAfuChat] = useState<NonAfuContact[]>([]);

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

    const foundPhones = new Set(allProfiles.map((p) => p.phone_number));

    const found: AfuContact[] = allProfiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      handle: p.handle,
      avatar_url: p.avatar_url,
      acoin: p.acoin || 0,
      phone_number: p.phone_number,
      phonebook_name: phoneMap.get(p.phone_number) || p.display_name,
    }));

    const notFound: NonAfuContact[] = [];
    for (const [phone, name] of phoneMap.entries()) {
      if (!foundPhones.has(phone)) {
        notFound.push({ name, phone });
      }
    }

    saveAllPhonebookNames(
      found.map((c) => ({ userId: c.id, name: c.phonebook_name })),
    ).catch(() => {});

    setOnAfuChat(found);
    setNotOnAfuChat(notFound.slice(0, 200));
    setState("done");
  }, [user]);

  useEffect(() => { findContacts(); }, [findContacts]);

  if (Platform.OS === "web") {
    return (
      <MobileOnlyView
        title="Phone Contacts"
        description="Finding your phone contacts requires access to your native contacts list. This feature is only available on the AfuChat mobile app."
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Phone Contacts</Text>
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
            Allow contacts permission in your phone settings to find your friends on AfuChat.
          </Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.accent }]} onPress={findContacts}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "done" && onAfuChat.length === 0 && notOnAfuChat.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="person-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No contacts found</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            No phone contacts were found. Make sure your contacts are synced.
          </Text>
        </View>
      )}

      {state === "done" && (onAfuChat.length > 0 || notOnAfuChat.length > 0) && (
        <FlatList
          data={[]}
          keyExtractor={() => ""}
          renderItem={null}
          ListHeaderComponent={
            <>
              {/* ── On AfuChat section ── */}
              {onAfuChat.length > 0 && (
                <>
                  <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary }]}>
                    <View style={[styles.sectionDot, { backgroundColor: "#34C759" }]} />
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      On AfuChat ({onAfuChat.length})
                    </Text>
                  </View>
                  {onAfuChat.map((item) => (
                    <TouchableOpacity
                      key={item.id}
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
                        style={[styles.actionBtn, { backgroundColor: colors.accent }]}
                        onPress={async () => {
                          const { data } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: item.id });
                          if (data) router.push({ pathname: "/chat/[id]", params: { id: data } });
                        }}
                      >
                        <Ionicons name="chatbubble" size={16} color="#fff" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* ── Not on AfuChat section ── */}
              {notOnAfuChat.length > 0 && (
                <>
                  <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary, marginTop: onAfuChat.length > 0 ? 12 : 0 }]}>
                    <View style={[styles.sectionDot, { backgroundColor: colors.textMuted }]} />
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      Invite Friends ({notOnAfuChat.length})
                    </Text>
                  </View>
                  <Text style={[styles.inviteHint, { color: colors.textMuted }]}>
                    These contacts aren't on AfuChat yet — invite them!
                  </Text>
                  {notOnAfuChat.map((item) => (
                    <View
                      key={item.phone}
                      style={[styles.card, { backgroundColor: colors.surface }]}
                    >
                      <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                        <Ionicons name="person-outline" size={22} color={colors.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.displayName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.handle, { color: colors.textMuted }]}>{item.phone}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.backgroundSecondary, borderWidth: 1.5, borderColor: colors.accent }]}
                        onPress={() => sendInvite(item.name, item.phone)}
                      >
                        <Ionicons name="share-outline" size={16} color={colors.accent} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

              <View style={{ height: 40 }} />
            </>
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 8 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  inviteHint: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingBottom: 8 },
  card: {
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  displayName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  phonebookName: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
