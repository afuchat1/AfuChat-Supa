import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MobileOnlyView } from "@/components/ui/MobileOnlyView";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { createAfuChatDirectConversation } from "@/lib/afuchatApi";
import { Avatar } from "@/components/ui/Avatar";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";
import { usePhoneContacts } from "@/lib/usePhoneContacts";
import { callPhoneNumber, isValidInternationalPhoneNumber, sendPhoneInvite } from "@/lib/phoneContacts";
import { isOnline } from "@/lib/offlineStore";
import { getLocalConversations } from "@/lib/storage/localConversations";
import { showAlert } from "@/lib/alert";
import InviteOptionsSheet from "@/components/InviteOptionsSheet";

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
  key: string;
  name: string;
  phone: string;
  normalized_phone: string;
};

export default function PhoneContactsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { contacts: cachedContacts, permission, refresh } = usePhoneContacts(user?.id);
  const [state, setState] = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [onAfuChat, setOnAfuChat] = useState<AfuContact[]>([]);
  const [notOnAfuChat, setNotOnAfuChat] = useState<NonAfuContact[]>([]);
  const [inviteTarget, setInviteTarget] = useState<NonAfuContact | null>(null);

  const handleCall = useCallback(async (phone: string) => {
    const opened = await callPhoneNumber(phone);
    if (!opened) {
      showAlert("Unable to call", "Your phone could not open the dialer for this number.");
    }
  }, []);

  const findContacts = useCallback(async () => {
    setState(permission === "denied" ? "denied" : "done");
    await refresh();
  }, [permission, refresh]);

  useEffect(() => {
    const found: AfuContact[] = [];
    const notFound: NonAfuContact[] = [];
    const seenUsers = new Set<string>();
    const seenInvitePhones = new Set<string>();
    for (const row of cachedContacts) {
      // Cached data can predate the strict scanner. Never show rows without
      // a valid full international number, even during refresh.
      if (!isValidInternationalPhoneNumber(row.normalized_phone)) continue;
      if (row.matched_user_id && row.matched_user_id !== user?.id) {
        if (seenUsers.has(row.matched_user_id)) continue;
        seenUsers.add(row.matched_user_id);
        found.push({
          id: row.matched_user_id,
          display_name: row.name || row.matched_display_name || "",
          handle: row.matched_handle || "",
          avatar_url: row.matched_avatar_url,
          acoin: row.matched_acoin,
          phone_number: row.normalized_phone,
          phonebook_name: row.name,
        });
      } else if (!row.matched_user_id) {
        if (seenInvitePhones.has(row.normalized_phone)) continue;
        seenInvitePhones.add(row.normalized_phone);
        notFound.push({
          key: row.key,
          name: row.name,
          phone: row.phone,
          normalized_phone: row.normalized_phone,
        });
      }
    }
    setOnAfuChat(
      found.sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
      ),
    );
    setNotOnAfuChat(
      notFound.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    );
    if (cachedContacts.length > 0 || permission !== "idle") {
      setState(permission === "denied" ? "denied" : "done");
    }
  }, [cachedContacts, permission, user?.id]);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Invite Contacts</Text>
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
          <Ionicons name="people" size={56} color={colors.textMuted} />
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
          <Ionicons name="person" size={56} color={colors.textMuted} />
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
                    <View
                      key={`${item.id}:${item.phone_number}`}
                      style={[styles.card, { backgroundColor: colors.surface }]}
                    >
                      <TouchableOpacity
                        style={styles.contactMain}
                        onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.id } })}
                        activeOpacity={0.85}
                      >
                        <Avatar uri={item.avatar_url} name={item.display_name} size={48} />
                        <View style={{ flex: 1 }}>
                          <View style={styles.nameRow}>
                            <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>
                            <PrestigeBadge acoin={item.acoin} size="sm" />
                          </View>
                          <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>@{item.handle}</Text>
                          <Text style={[styles.phoneNumber, { color: colors.textMuted }]} numberOfLines={1}>{item.phone_number}</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.actionGroup}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: "#34C759" }]}
                          onPress={() => void handleCall(item.phone_number)}
                          accessibilityRole="button"
                          accessibilityLabel={`Call ${item.display_name}`}
                        >
                          <Ionicons name="call" size={16} color="#fff" />
                        </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.accent }]}
                        onPress={async () => {
                          if (!isOnline()) {
                            const cached = (await getLocalConversations()).find(
                              (conversation) => conversation.other_id === item.id,
                            );
                            if (cached) {
                              router.push({ pathname: "/chat/[id]", params: { id: cached.id } });
                            } else {
                              showAlert("You're offline", "This conversation will be available after you reconnect.");
                            }
                            return;
                          }
                          const { data, error } = await createAfuChatDirectConversation(item.id);
                          if (error || !data) {
                            showAlert("Error", "Could not start conversation. Please try again.");
                            return;
                          }
                          router.push({ pathname: "/chat/[id]", params: { id: data } });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Message ${item.display_name}`}
                      >
                        <Ionicons name="chatbubble" size={16} color="#fff" />
                      </TouchableOpacity>
                      </View>
                    </View>
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
                      key={item.key}
                      style={[styles.card, { backgroundColor: colors.surface }]}
                    >
                      <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                        <Ionicons name="person" size={22} color={colors.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.displayName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.handle, { color: colors.textMuted }]}>{item.phone}</Text>
                      </View>
                      <View style={styles.actionGroup}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: "#34C759" }]}
                          onPress={() => void handleCall(item.normalized_phone)}
                          accessibilityRole="button"
                          accessibilityLabel={`Call ${item.name}`}
                        >
                          <Ionicons name="call" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.inviteButton, { backgroundColor: colors.accent }]}
                          onPress={() => setInviteTarget(item)}
                        >
                          <Ionicons name="paper-plane" size={15} color="#fff" />
                          <Text style={styles.inviteButtonText}>Invite</Text>
                        </TouchableOpacity>
                      </View>
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
      <InviteOptionsSheet
        visible={!!inviteTarget}
        onClose={() => setInviteTarget(null)}
        onSelect={(method) => {
          if (inviteTarget) void sendPhoneInvite(inviteTarget.normalized_phone, method);
        }}
      />
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
    
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 8 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, marginTop: 8 },
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
  contactMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  displayName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  phoneNumber: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  phonebookName: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  inviteButtonText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
