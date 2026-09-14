import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHAT_FAST_DURATION } from "@/lib/chatMotion";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { AnimatedSearchSurface } from "@/components/chat/AnimatedSearchSurface";
import { Separator } from "@/components/ui/Separator";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { isOnline } from "@/lib/offlineStore";
import {
  getLocalContacts,
  saveLocalContacts,
  getAllPhonebookNames,
} from "@/lib/storage/localContacts";
import {
  isValidInternationalPhoneNumber,
  sendPhoneInvite,
  syncPhoneContacts,
} from "@/lib/phoneContacts";
import {
  getLocalPhoneContacts,
  type LocalPhoneContact,
} from "@/lib/storage/localPhoneContacts";
import { createLocalNotesConversation, LOCAL_NOTES_NAME } from "@/lib/storage/localNotes";
import { getLocalConversations } from "@/lib/storage/localConversations";
import InviteOptionsSheet from "@/components/InviteOptionsSheet";

type Contact = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  bio: string | null;
};

type NonAfuContact = Pick<LocalPhoneContact, "key" | "name" | "phone" | "normalized_phone">;


type SearchResult = Contact & { _searching?: boolean };

type GroupItem = { id: string; name: string; avatar_url: string | null };
type ChannelItem = { id: string; name: string; avatar_url: string | null; is_verified?: boolean };

export default function NewChatScreen() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardOffsetAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      const height = e.endCoordinates.height;
      Animated.timing(keyboardOffsetAnim, { toValue: height, duration: CHAT_FAST_DURATION, useNativeDriver: false }).start();
      setKeyboardHeight(height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      Animated.timing(keyboardOffsetAnim, { toValue: 0, duration: CHAT_FAST_DURATION, useNativeDriver: false }).start();
      setKeyboardHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, [keyboardOffsetAnim]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [phonebookNames, setPhonebookNames] = useState<Map<string, string>>(new Map());
  const [phoneOnAfu, setPhoneOnAfu] = useState<Contact[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [phoneNotAfu, setPhoneNotAfu] = useState<NonAfuContact[]>([]);
  const [inviteTarget, setInviteTarget] = useState<NonAfuContact | null>(null);
  const [selected, setSelected] = useState<Map<string, Contact>>(new Map());
  const [starting, setStarting] = useState(false);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    getAllPhonebookNames().then(setPhonebookNames).catch(() => {});
  }, []);

  const loadContacts = useCallback(
    async (background = false) => {
      if (!user) return;

      if (!background) {
        const local = await getLocalContacts();
        if (local.length > 0) {
          setContacts(
            local
              .filter((contact) => contact.id !== user.id)
              .sort((a, b) =>
              a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
              ),
          );
          setLoading(false);
        }
      }

      if (!isOnline()) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const { data: followRows } = await supabase
          .from("follows")
          .select(
            "following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified)"
          )
          .eq("follower_id", user.id);

        if (followRows) {
          const list = followRows
            .map((f: any) => f.profiles)
            .filter((profile: Contact | null): profile is Contact => !!profile && profile.id !== user.id)
            .sort((a: Contact, b: Contact) =>
              a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
            );
          setContacts(list);
          saveLocalContacts(list).catch(() => {});
        }
      } catch (_) {
        // Network error — keep showing cached contacts
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );


  const loadGroupsAndChannels = useCallback(async () => {
    if (!user) return;
    const [{ data: memberRows }, { data: subRows }, { data: ownedRows }] = await Promise.all([
      supabase
        .from("chat_members")
        .select("chat_id, chats(id, name, avatar_url, is_group)")
        .eq("user_id", user.id),
      supabase
        .from("channel_subscriptions")
        .select("channel_id, channels(id, name, avatar_url, is_verified)")
        .eq("user_id", user.id),
      supabase.rpc("get_my_channels"),
    ]);

    const groupItems: GroupItem[] = (memberRows || []).flatMap((m: any) => {
      const chat = Array.isArray(m.chats) ? m.chats[0] : m.chats;
      if (!chat || !chat.is_group) return [];
      return [{ id: chat.id, name: chat.name || "Group", avatar_url: chat.avatar_url || null }];
    });
    setGroups(groupItems);

    const subChannels: ChannelItem[] = (subRows || []).flatMap((s: any) => {
      const ch = Array.isArray(s.channels) ? s.channels[0] : s.channels;
      if (!ch) return [];
       return [{ id: ch.id, name: ch.name || "Channel", avatar_url: ch.avatar_url || null, is_verified: !!ch.is_verified }];
    });
    const subIds = new Set(subChannels.map((c) => c.id));
    const ownedChannels: ChannelItem[] = (ownedRows || [])
      .filter((ch: any) => !subIds.has(ch.id))
       .map((ch: any) => ({ id: ch.id, name: ch.name || "Channel", avatar_url: ch.avatar_url || null, is_verified: !!ch.is_verified }));
    setChannels([...subChannels, ...ownedChannels]);
  }, [user]);

  const loadPhoneContacts = useCallback(async () => {
    if (!user) return;
    const applyCached = (rows: LocalPhoneContact[]) => {
      const onAfu: Contact[] = [];
      const notAfu: NonAfuContact[] = [];
      const seenUsers = new Set<string>();
      const seenInvitePhones = new Set<string>();
      for (const row of rows) {
        // Do not render stale or incomplete cached phonebook rows.
        if (!isValidInternationalPhoneNumber(row.normalized_phone)) continue;
        if (row.matched_user_id && row.matched_user_id !== user.id) {
          if (seenUsers.has(row.matched_user_id)) continue;
          seenUsers.add(row.matched_user_id);
          onAfu.push({
            id: row.matched_user_id,
            display_name: row.name || phonebookNames.get(row.matched_user_id) || "",
            handle: row.matched_handle || "",
            avatar_url: row.matched_avatar_url,
            is_verified: row.matched_is_verified,
            is_organization_verified: row.matched_is_organization_verified,
            bio: row.matched_bio,
          });
        } else if (!row.matched_user_id) {
          if (seenInvitePhones.has(row.normalized_phone)) continue;
          seenInvitePhones.add(row.normalized_phone);
          notAfu.push({
            key: row.key,
            name: row.name,
            phone: row.phone,
            normalized_phone: row.normalized_phone,
          });
        }
      }
       setPhoneOnAfu(
         onAfu.sort((a, b) =>
           a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
         ),
       );
       setPhoneNotAfu(
         notAfu.sort((a, b) =>
           a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
         ),
       );
    };
    applyCached(await getLocalPhoneContacts());
    void syncPhoneContacts(user.id, applyCached, applyCached);
  }, [user, phonebookNames]);

  useEffect(() => {
    loadContacts();
    loadGroupsAndChannels();
    loadPhoneContacts();
  }, [loadContacts, loadGroupsAndChannels, loadPhoneContacts]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const q = query.trim().toLowerCase();
    const phoneUserIds = new Set(phoneOnAfu.map((contact) => contact.id));
    const visibleContacts = contacts.filter(
      (contact) => contact.id !== user?.id && !phoneUserIds.has(contact.id),
    );
    const inContacts = visibleContacts.filter(
      (c) =>
        c.display_name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q)
    );

    if (inContacts.length > 0) {
      setSearchResults(inContacts);
      setSearching(false);
    } else {
      setSearching(true);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(async () => {
        if (!isOnline()) {
          setSearching(false);
          return;
        }
        const { data } = await supabase
          .from("profiles")
          .select(
            "id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified"
          )
          .or(
            `handle.ilike.%${query.trim()}%,display_name.ilike.%${query.trim()}%`
          )
          .neq("id", user?.id)
          .limit(20);
        setSearchResults((data as Contact[]) || []);
        setSearching(false);
      }, 400);
    }
  }, [query, contacts, phoneOnAfu, user?.id]);

  const toggleSelect = useCallback((contact: Contact) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(contact.id)) {
        next.delete(contact.id);
      } else {
        next.set(contact.id, contact);
      }
      return next;
    });
  }, []);

  async function openChat(contactId: string) {
    if (!user) return;
    // The user's own profile is not a regular contact. Keep self-chat logic
    // entirely in the device-only My Notes conversation.
    if (contactId === user.id) {
      await openMyNotes();
      return;
    }
    if (!isOnline()) {
      const cached = (await getLocalConversations()).find(
        (conversation) => conversation.other_id === contactId,
      );
      if (cached) {
        router.push({ pathname: "/chat/[id]", params: { id: cached.id } });
      } else {
        showAlert("You're offline", "This conversation will be available after you reconnect.");
      }
      return;
    }
    setStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { data: chatId, error } = await supabase.rpc(
      "get_or_create_direct_chat",
      { other_user_id: contactId }
    );
    setStarting(false);
    if (error || !chatId) {
      showAlert("Error", "Could not start conversation. Please try again.");
      return;
    }
    router.push({
      pathname: "/chat/[id]",
      params: { id: chatId },
    });
  }

  async function openMyNotes() {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const notesId = await createLocalNotesConversation(user.id);
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: notesId,
        otherName: LOCAL_NOTES_NAME,
        otherId: user.id,
        isGroup: "false",
        isChannel: "false",
      },
    });
  }

  async function createGroup() {
    if (selected.size < 2) {
      showAlert("Select contacts", "Pick at least 2 contacts to create a group.");
      return;
    }
    const ids = Array.from(selected.keys());
    const names = Array.from(selected.values())
      .map((c) => c.display_name)
      .join(", ");
    router.push({
      pathname: "/group/create",
      params: { preselected: JSON.stringify(ids), preselectedNames: names },
    });
  }

  const isSearchMode = query.trim().length > 0;

  return (
    <Animated.View style={[styles.root, { backgroundColor: colors.background, paddingBottom: keyboardOffsetAnim }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, backgroundColor: colors.background },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color={accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          New Message
        </Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.push("/app/afuqr")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="qr-code" size={22} color={accent} />
        </TouchableOpacity>
      </View>

      {/* ── "To:" field ── */}
      <View
        style={[
          styles.toWrap,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <Text style={[styles.toLabel, { color: colors.textMuted }]}>To:</Text>

        <View style={[styles.toPill, { backgroundColor: colors.inputBg, borderColor: colors.border, ...Platform.select({ web: { boxShadow: "0 2px 14px rgba(0,0,0,0.13)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.13, shadowRadius: 8, elevation: 4 } }) }]}>
          {/* Selected chips */}
          {selected.size > 0 && (
            <FlatList
              horizontal
              data={Array.from(selected.values())}
              keyExtractor={(c) => c.id}
              showsHorizontalScrollIndicator={false}
              style={styles.chipList}
              contentContainerStyle={{ gap: 6, paddingRight: 4 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: accent + "22" }]}
                  onPress={() => toggleSelect(item)}
                  activeOpacity={0.75}
                >
                  <Avatar uri={item.avatar_url} name={item.display_name} size={18} />
                  <Text style={[styles.chipText, { color: accent }]} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  <Ionicons name="close-circle" size={13} color={accent} />
                </TouchableOpacity>
              )}
            />
          )}

          <AnimatedSearchSurface style={{ flex: 1 }}>
            <TextInput
              ref={inputRef}
              style={[styles.toInput, { color: colors.text }]}
              placeholder={selected.size === 0 ? "Search name or @handle…" : ""}
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </AnimatedSearchSurface>

          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <View style={[styles.clearBtn, { backgroundColor: colors.textMuted + "28" }]}>
                <Ionicons name="close" size={13} color={colors.textMuted} />
              </View>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {/* ── Search results ── */}
        {isSearchMode ? (
          <View style={{ flex: 1 }}>
            {searching ? (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color={accent} />
                <Text style={[styles.searchingText, { color: colors.textMuted }]}>
                  Searching…
                </Text>
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.emptySearch}>
                <Ionicons name="search" size={44} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No results for "{query}"
                </Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Try a different name or handle
                </Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <Separator indent={70} />}
                contentContainerStyle={{ paddingBottom: 120 }}
                renderItem={({ item }) => (
                  <ContactRow
                    item={item}
                    isSelected={selected.has(item.id)}
                    onPress={() => {
                      if (selected.size > 0) {
                        toggleSelect(item);
                      } else {
                        openChat(item.id);
                      }
                    }}
                    onLongPress={() => toggleSelect(item)}
                    phonebookName={phonebookNames.get(item.id)}
                    colors={colors}
                    accent={accent}
                  />
                )}
              />
            )}
          </View>
        ) : (
          /* ── Normal (non-search) view ── */
          <FlatList
            data={loading ? [] : contacts.filter((contact) => contact.id !== user?.id && !phoneOnAfu.some((phone) => phone.id === contact.id))}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  loadContacts();
                }}
                tintColor={accent}
              />
            }
            ListHeaderComponent={
              <ListHeader
                colors={colors}
                accent={accent}
                loading={loading}
                phoneOnAfu={phoneOnAfu}
                selected={selected}
                onPhoneContactPress={(c) => {
                  if (selected.size > 0) {
                    toggleSelect(c);
                  } else {
                    openChat(c.id);
                  }
                }}
                phonebookNames={phonebookNames}
                contactCount={contacts.filter((contact) => contact.id !== user?.id && !phoneOnAfu.some((phone) => phone.id === contact.id)).length}
                groups={groups}
                channels={channels}
                onGroupPress={(g) => router.push({ pathname: "/chat/[id]", params: { id: g.id } } as any)}
                onChannelPress={(c) => router.push({ pathname: "/chat/[id]", params: { id: c.id, isChannel: "true", chatName: c.name, chatAvatar: c.avatar_url || "" } } as any)}
                onNotesPress={openMyNotes}
              />
            }
            renderItem={({ item }) => (
              <ContactRow
                item={item}
                isSelected={selected.has(item.id)}
                onPress={() => {
                  if (selected.size > 0) {
                    toggleSelect(item);
                  } else {
                    openChat(item.id);
                  }
                }}
                onLongPress={() => toggleSelect(item)}
                phonebookName={phonebookNames.get(item.id)}
                colors={colors}
                accent={accent}
              />
            )}
            ItemSeparatorComponent={() => <Separator indent={70} />}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyCenter}>
                  <Ionicons
                    name="people-circle"
                    size={72}
                    color={colors.textMuted}
                  />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    No contacts yet
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                    Follow people to start chatting with them
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              phoneNotAfu.length > 0 ? (
                <View style={{ paddingBottom: 40 }}>
                  <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary, marginTop: 8 }]}>
                    <Text style={[styles.sectionTitle, { color: accent }]}>
                      INVITE FRIENDS: {phoneNotAfu.length}
                    </Text>
                  </View>
                  {phoneNotAfu.map((item) => (
                      <View key={item.key} style={[styles.contactRow, { backgroundColor: colors.surface }]}>
                        <View style={[styles.avatarWrap, { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }]}>
                          <Ionicons name="person" size={22} color={colors.textMuted} />
                        </View>
                        <View style={styles.contactContent}>
                          <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                          <Text style={[styles.contactHandle, { color: colors.textMuted }]} numberOfLines={1}>{item.phone}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.inviteButton, { backgroundColor: colors.accent }]}
                          onPress={() => setInviteTarget(item)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="paper-plane" size={14} color="#fff" />
                          <Text style={styles.inviteButtonText}>Invite</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                </View>
              ) : <View style={{ height: 40 }} />
            }
          />
        )}

        {/* ── Bottom action bar ── */}
        {selected.size > 0 && (
          <View
            style={[
              styles.actionBar,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.separator,
                paddingBottom: insets.bottom + 8,
              },
            ]}
          >
            <View style={styles.selectedInfo}>
              <Text style={[styles.selectedCount, { color: colors.text }]}>
                {selected.size} selected
              </Text>
              <Text style={[styles.selectedNames, { color: colors.textMuted }]} numberOfLines={1}>
                {Array.from(selected.values())
                  .map((c) => c.display_name)
                  .join(", ")}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: accent }]}
              onPress={createGroup}
              activeOpacity={0.85}
            >
              <Ionicons name="people" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>New Group</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Starting chat overlay ── */}
        {starting && (
          <View style={styles.startingOverlay}>
            <ActivityIndicator color={accent} size="large" />
          </View>
        )}
        <InviteOptionsSheet
          visible={!!inviteTarget}
          onClose={() => setInviteTarget(null)}
          onSelect={(method) => {
            if (inviteTarget) void sendPhoneInvite(inviteTarget.normalized_phone, method);
          }}
        />
      </View>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────────────────────
   List Header: quick actions + skeleton + recents
───────────────────────────────────────────────────────────── */
function ListHeader({
  colors,
  accent,
  loading,
  phoneOnAfu,
  selected,
  onPhoneContactPress,
  phonebookNames,
  contactCount,
  groups,
  channels,
  onGroupPress,
  onChannelPress,
  onNotesPress,
}: {
  colors: any;
  accent: string;
  loading: boolean;
  phoneOnAfu: Contact[];
  selected: Map<string, Contact>;
  onPhoneContactPress: (c: Contact) => void;
  phonebookNames: Map<string, string>;
  contactCount: number;
  groups: GroupItem[];
  channels: ChannelItem[];
  onGroupPress: (g: GroupItem) => void;
  onChannelPress: (c: ChannelItem) => void;
  onNotesPress: () => void;
}) {
  return (
    <View>
      {/* Quick actions */}
      <View
        style={[
          styles.quickActions,
          { backgroundColor: colors.surface, borderColor: colors.separator },
        ]}
      >
        <QuickAction
          icon="people"
          iconBg="#007AFF"
          label="New Group"
          onPress={() => router.push("/group/create")}
          colors={colors}
        />
        <Separator indent={58} />
        <QuickAction
          icon="megaphone"
          iconBg="#34C759"
          label="New Channel"
          onPress={() => router.push("/channel/intro" as any)}
          colors={colors}
        />
        <Separator indent={58} />
        <QuickAction
          icon="bookmark"
          iconBg="#7B61FF"
          label="My Notes"
          onPress={onNotesPress}
          colors={colors}
        />
      </View>

      {/* Phone contacts on platform — always at top */}
      {!loading && phoneOnAfu.length > 0 && (
        <View>
          <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.sectionTitle, { color: accent }]}>FROM YOUR CONTACTS</Text>
          </View>
            {phoneOnAfu.map((c, i) => (
            <View key={`${c.id}:${i}`}>
              <TouchableOpacity
                style={[styles.contactRow, { backgroundColor: colors.surface }]}
                onPress={() => onPhoneContactPress(c)}
                activeOpacity={0.7}
              >
                <View style={styles.avatarWrap}>
                  <Avatar uri={c.avatar_url} name={c.display_name} size={48} />
                </View>
                <View style={styles.contactContent}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                      {c.display_name}
                    </Text>
                    {c.is_verified && <VerifiedBadge isVerified size={13} />}
                  </View>
                  <Text style={[styles.contactHandle, { color: colors.textMuted }]} numberOfLines={1}>
                    @{c.handle}
                  </Text>
                </View>
              </TouchableOpacity>
              {i < phoneOnAfu.length - 1 && <Separator indent={70} />}
            </View>
          ))}
        </View>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <View>
          <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.sectionTitle, { color: accent }]}>GROUPS</Text>
          </View>
          {groups.map((g, i) => (
            <View key={g.id}>
              <TouchableOpacity
                style={[styles.contactRow, { backgroundColor: colors.surface }]}
                onPress={() => onGroupPress(g)}
                activeOpacity={0.7}
              >
                <View style={styles.avatarWrap}>
                  <Avatar uri={g.avatar_url} name={g.name} size={48} square />
                </View>
                <View style={styles.contactContent}>
                  <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>{g.name}</Text>
                  <Text style={[styles.contactHandle, { color: colors.textMuted }]}>Group</Text>
                </View>
                <Ionicons name="chatbubbles" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {i < groups.length - 1 && <Separator indent={70} />}
            </View>
          ))}
        </View>
      )}

      {/* Channels */}
      {channels.length > 0 && (
        <View>
          <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.sectionTitle, { color: accent }]}>CHANNELS</Text>
          </View>
          {channels.map((c, i) => (
            <View key={c.id}>
              <TouchableOpacity
                style={[styles.contactRow, { backgroundColor: colors.surface }]}
                onPress={() => onChannelPress(c)}
                activeOpacity={0.7}
              >
                <View style={styles.avatarWrap}>
                  <Avatar uri={c.avatar_url} name={c.name} size={48} square />
                </View>
                <View style={styles.contactContent}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                    {c.is_verified && <VerifiedBadge isVerified size={13} />}
                  </View>
                  <Text style={[styles.contactHandle, { color: colors.textMuted }]}>Channel</Text>
                </View>
                <Ionicons name="megaphone" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {i < channels.length - 1 && <Separator indent={70} />}
            </View>
          ))}
        </View>
      )}

      {/* Skeleton */}
      {loading && (
        <View style={{ paddingTop: 8 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ContactRowSkeleton key={i} />
          ))}
        </View>
      )}

      {/* Contacts count */}
      {!loading && contactCount > 0 && (
        <View
          style={[
            styles.sectionHeader,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: accent }]}>
                    CONTACTS: {contactCount}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
   Quick Action Row
───────────────────────────────────────────────────────────── */
function QuickAction({
  icon,
  iconBg,
  label,
  onPress,
  colors,
}: {
  icon: any;
  iconBg: string;
  label: string;
  onPress: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      style={styles.quickActionRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.quickIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <Text style={[styles.quickLabel, { color: colors.text }]}>{label}</Text>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        style={{ marginLeft: "auto" }}
      />
    </TouchableOpacity>
  );
}

/* ─────────────────────────────────────────────────────────────
   Contact Row
───────────────────────────────────────────────────────────── */
function ContactRow({
  item,
  isSelected,
  onPress,
  onLongPress,
  phonebookName,
  colors,
  accent,
}: {
  item: Contact;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  phonebookName?: string;
  colors: any;
  accent: string;
}) {
  const savedAs =
    phonebookName && phonebookName !== item.display_name ? phonebookName : null;

  return (
    <TouchableOpacity
      style={[styles.contactRow, { backgroundColor: colors.surface }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Selection indicator */}
      <View style={styles.avatarWrap}>
        {isSelected && (
          <View style={[styles.selectionRing, { borderColor: accent }]} />
        )}
        <Avatar
          uri={item.avatar_url}
          name={item.display_name}
          size={48}
          square={!!(item.is_organization_verified)}
        />
        {isSelected && (
          <View style={[styles.selectionCheck, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={11} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.contactContent}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.contactName, { color: colors.text }]}
            numberOfLines={1}
          >
            {savedAs || item.display_name}
          </Text>
          <VerifiedBadge
            isVerified={item.is_verified}
            isOrganizationVerified={item.is_organization_verified}
            size={13}
          />
        </View>
        {savedAs ? (
          <Text
            style={[styles.contactHandle, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {item.display_name} · @{item.handle}
          </Text>
        ) : (
          <Text
            style={[styles.contactHandle, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            @{item.handle}
          </Text>
        )}
      </View>

      {!isSelected && (
        <Ionicons
          name="chatbubble"
          size={16}
          color={colors.textMuted}
        />
      )}
    </TouchableOpacity>
  );
}

/* ─────────────────────────────────────────────────────────────
   Styles
───────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },

  toWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    
  },
  toLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  toPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 0.5,
    paddingHorizontal: 14,
    height: 40,
    gap: 9,
  },
  chipList: { maxHeight: 28 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
    height: 26,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    maxWidth: 90,
  },
  toInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: 40,
    letterSpacing: 0.1,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  body: { flex: 1, position: "relative" },

  quickActions: {
    marginTop: 10,
    marginBottom: 4,
    
    
  },
  quickActionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 14,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 12,
  },
  avatarWrap: { position: "relative", width: 48, height: 48 },
  selectionRing: {
    position: "absolute",
    inset: -2,
    borderRadius: 26,
    borderWidth: 2,
    zIndex: 1,
  },
  selectionCheck: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  contactContent: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  contactName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  contactHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  inviteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  inviteBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 13,
  },
  inviteButtonText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  scrubber: {
    width: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
    gap: 1,
  },
  scrubberLetter: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    
  },
  selectedInfo: { flex: 1 },
  selectedCount: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  selectedNames: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
  },
  actionBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },

  searchingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 20,
  },
  searchingText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  emptySearch: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyCenter: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  startingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  phoneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    
    
    marginTop: 8,
  },
  phoneCenter: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: 28,
  },
  phoneHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 999, marginTop: 4 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  phoneSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  phoneDot: { width: 7, height: 7, borderRadius: 4 },
  phoneSectionTitle: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  phoneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 7,
    borderRadius: 12,
    padding: 12,
  },
  phoneActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneAvPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
