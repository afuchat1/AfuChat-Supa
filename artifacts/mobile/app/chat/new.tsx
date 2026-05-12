import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  SectionListData,
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
import { showAlert } from "@/lib/alert";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { Separator } from "@/components/ui/Separator";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { isOnline } from "@/lib/offlineStore";
import {
  getLocalContacts,
  saveLocalContacts,
  getAllPhonebookNames,
} from "@/lib/storage/localContacts";
import { getLocalConversations } from "@/lib/storage/localConversations";

type Contact = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  bio: string | null;
};

type RecentPartner = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  chatId: string;
  last_message_at: string;
};

type SearchResult = Contact & { _searching?: boolean };

type Section = { title: string; data: Contact[] };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

function groupByLetter(contacts: Contact[]): Section[] {
  const map: Record<string, Contact[]> = {};
  contacts.forEach((c) => {
    const ch = c.display_name.charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(ch) ? ch : "#";
    if (!map[letter]) map[letter] = [];
    map[letter].push(c);
  });
  return Object.entries(map)
    .sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    })
    .map(([title, data]) => ({ title, data }));
}

export default function NewChatScreen() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [phonebookNames, setPhonebookNames] = useState<Map<string, string>>(new Map());
  const [recents, setRecents] = useState<RecentPartner[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, Contact>>(new Map());
  const [starting, setStarting] = useState(false);

  const sectionListRef = useRef<SectionList<Contact, Section>>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const sectionLetters = useMemo(() => {
    const sections = groupByLetter(contacts);
    return sections.map((s) => s.title);
  }, [contacts]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      getAllPhonebookNames().then(setPhonebookNames).catch(() => {});
    }
  }, []);

  const loadContacts = useCallback(
    async (background = false) => {
      if (!user) return;

      if (!background) {
        const local = await getLocalContacts();
        if (local.length > 0) {
          setContacts(local);
          setLoading(false);
        }
      }

      if (!isOnline()) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data: followRows } = await supabase
        .from("follows")
        .select(
          "following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified)"
        )
        .eq("follower_id", user.id);

      if (followRows) {
        const list = followRows
          .map((f: any) => f.profiles)
          .filter(Boolean)
          .sort((a: Contact, b: Contact) =>
            a.display_name.localeCompare(b.display_name)
          );
        setContacts(list);
        saveLocalContacts(list).catch(() => {});
      }
      setLoading(false);
      setRefreshing(false);
    },
    [user]
  );

  const loadRecents = useCallback(async () => {
    if (!user) return;
    const local = await getLocalConversations();
    const dms = local
      .filter((c: any) => !c.is_group && !c.is_channel && c.other_id && c.other_id !== user.id)
      .sort(
        (a: any, b: any) =>
          new Date(b.last_message_at || 0).getTime() -
          new Date(a.last_message_at || 0).getTime()
      )
      .slice(0, 6);

    setRecents(
      dms.map((c: any) => ({
        id: c.other_id,
        display_name: c.other_display_name || c.name || "Unknown",
        avatar_url: c.other_avatar || null,
        is_verified: c.is_verified || false,
        is_organization_verified: c.is_organization_verified || false,
        chatId: c.id,
        last_message_at: c.last_message_at,
      }))
    );
  }, [user]);

  useEffect(() => {
    loadContacts();
    loadRecents();
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [loadContacts, loadRecents]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const q = query.trim().toLowerCase();
    const inContacts = contacts.filter(
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
  }, [query, contacts, user?.id]);

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
    router.replace({ pathname: "/chat/[id]", params: { id: chatId } });
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

  function scrollToLetter(letter: string) {
    Haptics.selectionAsync();
    const sections = groupByLetter(contacts);
    const idx = sections.findIndex((s) => s.title === letter);
    if (idx >= 0) {
      sectionListRef.current?.scrollToLocation({
        sectionIndex: idx,
        itemIndex: 0,
        animated: true,
        viewOffset: 0,
      });
    }
  }

  const filteredSections = useMemo(() => {
    if (query.trim()) return [];
    return groupByLetter(contacts);
  }, [contacts, query]);

  const isSearchMode = query.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <OfflineBanner />

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
          onPress={() => router.push("/qr-scanner")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="qr-code-outline" size={22} color={accent} />
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

        <View style={[styles.toPill, { backgroundColor: colors.backgroundSecondary }]}>
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
                <Ionicons name="search-outline" size={44} color={colors.textMuted} />
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
          <View style={{ flex: 1, flexDirection: "row" }}>
            <SectionList
              ref={sectionListRef}
              sections={loading ? [] : filteredSections}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled
              contentContainerStyle={{ paddingBottom: 120 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    loadContacts();
                    loadRecents();
                  }}
                  tintColor={accent}
                />
              }
              ListHeaderComponent={
                <ListHeader
                  colors={colors}
                  accent={accent}
                  loading={loading}
                  recents={recents}
                  selected={selected}
                  onRecentPress={(r) => {
                    if (selected.size > 0) {
                      toggleSelect(r as any);
                    } else {
                      router.replace({
                        pathname: "/chat/[id]",
                        params: { id: r.chatId },
                      });
                    }
                  }}
                  phonebookNames={phonebookNames}
                  contactCount={contacts.length}
                />
              }
              renderSectionHeader={({ section }) => (
                <View
                  style={[
                    styles.sectionHeader,
                    { backgroundColor: colors.backgroundSecondary },
                  ]}
                >
                  <Text
                    style={[styles.sectionTitle, { color: accent }]}
                  >
                    {section.title}
                  </Text>
                </View>
              )}
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
                      name="people-circle-outline"
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
            />

            {/* ── A-Z Scrubber ── */}
            {!loading && contacts.length > 0 && (
              <View style={styles.scrubber}>
                {sectionLetters.map((letter) => (
                  <TouchableOpacity
                    key={letter}
                    onPress={() => scrollToLetter(letter)}
                    hitSlop={{ top: 2, bottom: 2, left: 6, right: 6 }}
                  >
                    <Text style={[styles.scrubberLetter, { color: accent }]}>
                      {letter}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
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
      </View>
    </KeyboardAvoidingView>
  );
}

/* ─────────────────────────────────────────────────────────────
   List Header: quick actions + skeleton + recents
───────────────────────────────────────────────────────────── */
function ListHeader({
  colors,
  accent,
  loading,
  recents,
  selected,
  onRecentPress,
  phonebookNames,
  contactCount,
}: {
  colors: any;
  accent: string;
  loading: boolean;
  recents: RecentPartner[];
  selected: Map<string, Contact>;
  onRecentPress: (r: RecentPartner) => void;
  phonebookNames: Map<string, string>;
  contactCount: number;
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
        {Platform.OS !== "web" && (
          <>
            <Separator indent={58} />
            <QuickAction
              icon="call"
              iconBg={accent}
              label="Find Phone Contacts"
              onPress={() => router.push("/phone-contacts")}
              colors={colors}
            />
          </>
        )}
      </View>

      {/* Skeleton */}
      {loading && (
        <View style={{ paddingTop: 8 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ContactRowSkeleton key={i} />
          ))}
        </View>
      )}

      {/* Recents */}
      {!loading && recents.length > 0 && (
        <View>
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: colors.backgroundSecondary },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: accent }]}>
              RECENT
            </Text>
          </View>
          {recents.map((r, i) => (
            <View key={`${r.id}-${i}`}>
              <TouchableOpacity
                style={[styles.contactRow, { backgroundColor: colors.surface }]}
                onPress={() => onRecentPress(r)}
                activeOpacity={0.7}
              >
                <View style={styles.avatarWrap}>
                  <Avatar
                    uri={r.avatar_url}
                    name={r.display_name}
                    size={48}
                  />
                </View>
                <View style={styles.contactContent}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[styles.contactName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {phonebookNames.get(r.id) || r.display_name}
                    </Text>
                    {r.is_verified && <VerifiedBadge isVerified size={13} />}
                  </View>
                  <Text
                    style={[styles.contactHandle, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {r.display_name !== (phonebookNames.get(r.id) || r.display_name) ? r.display_name : "Recent chat"}
                  </Text>
                </View>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
              {i < recents.length - 1 && <Separator indent={70} />}
            </View>
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
            CONTACTS — {contactCount}
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
          name="chatbubble-outline"
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  toPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
