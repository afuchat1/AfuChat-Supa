import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { showAlert } from "@/lib/alert";

type Contact = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  last_seen: string | null;
  show_online_status: boolean;
};

type PostThumb = {
  id: string;
  image_url: string | null;
  post_type: string | null;
  video_url: string | null;
  images: string[];
};

type Section = { letter: string; data: Contact[] };

function isOnlineNow(c: Contact): boolean {
  if (!c.show_online_status || !c.last_seen) return false;
  return Date.now() - new Date(c.last_seen).getTime() < 5 * 60 * 1000;
}

function groupByLetter(list: Contact[]): Section[] {
  const map: Record<string, Contact[]> = {};
  list.forEach((c) => {
    const l = c.display_name.charAt(0).toUpperCase();
    if (!map[l]) map[l] = [];
    map[l].push(c);
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, data]) => ({ letter, data }));
}

function ContactRow({
  item,
  isSelected,
  onSelect,
  colors,
}: {
  item: Contact;
  isSelected: boolean;
  onSelect: () => void;
  colors: any;
}) {
  const online = isOnlineNow(item);

  return (
    <TouchableOpacity
      style={[
        styles.row,
        isSelected && { backgroundColor: colors.accent + "18" },
      ]}
      onPress={onSelect}
      activeOpacity={0.75}
    >
      <View style={{ position: "relative" }}>
        <Avatar uri={item.avatar_url} name={item.display_name} size={42} />
        {online && (
          <View style={[styles.onlineDot, { borderColor: colors.surface ?? colors.background }]} />
        )}
      </View>
      <View style={styles.rowText}>
        <View style={styles.nameRow}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {item.display_name}
          </Text>
          <VerifiedBadge
            isVerified={item.is_verified}
            isOrganizationVerified={item.is_organization_verified}
            size={13}
          />
        </View>
        <Text style={[styles.rowHandle, { color: colors.textSecondary }]} numberOfLines={1}>
          @{item.handle}
        </Text>
      </View>
      {isSelected && (
        <View style={[styles.selectedDot, { backgroundColor: colors.accent }]} />
      )}
    </TouchableOpacity>
  );
}

function getBestThumb(post: PostThumb): string | null {
  if (post.images.length > 0) return post.images[0];
  if (post.image_url) return post.image_url;
  return null;
}

function ContactDetail({
  contact,
  colors,
  isDark,
  currentUserId,
  onMessage,
}: {
  contact: Contact;
  colors: any;
  isDark: boolean;
  currentUserId: string;
  onMessage: () => void;
}) {
  const [posts, setPosts] = useState<PostThumb[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const online = isOnlineNow(contact);

  useEffect(() => {
    setPostsLoading(true);
    setPosts([]);
    setFollowersCount(0);
    setFollowingCount(0);
    setIsFollowing(false);

    const fetchAll = async () => {
      const [postsRes, followersRes, followingRes, myFollowRes] = await Promise.all([
        supabase
          .from("posts")
          .select("id, image_url, post_type, video_url, post_images(image_url, display_order)")
          .eq("author_id", contact.id)
          .order("created_at", { ascending: false })
          .limit(9),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", contact.id),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", contact.id),
        supabase.from("follows").select("id").eq("follower_id", currentUserId).eq("following_id", contact.id).maybeSingle(),
      ]);

      if (postsRes.data) {
        setPosts(
          postsRes.data.map((p: any) => ({
            id: p.id,
            image_url: p.image_url,
            post_type: p.post_type,
            video_url: p.video_url,
            images: (p.post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
          }))
        );
      }
      setFollowersCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);
      setIsFollowing(!!myFollowRes.data);
      setPostsLoading(false);
    };

    fetchAll();
  }, [contact.id, currentUserId]);

  async function toggleFollow() {
    setFollowLoading(true);
    if (isFollowing) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", contact.id);
      setIsFollowing(false);
      setFollowersCount((n) => Math.max(0, n - 1));
    } else {
      await supabase.from("follows").upsert({ follower_id: currentUserId, following_id: contact.id });
      setIsFollowing(true);
      setFollowersCount((n) => n + 1);
    }
    setFollowLoading(false);
  }

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <View style={{ position: "relative", alignSelf: "center" }}>
          <Avatar uri={contact.avatar_url} name={contact.display_name} size={80} />
          {online && (
            <View style={[styles.onlineDotLg, { borderColor: colors.background }]} />
          )}
        </View>
        <View style={styles.detailNameRow}>
          <Text style={[styles.detailName, { color: colors.text }]}>{contact.display_name}</Text>
          <VerifiedBadge isVerified={contact.is_verified} isOrganizationVerified={contact.is_organization_verified} size={18} />
        </View>
        <Text style={[styles.detailHandle, { color: colors.textSecondary }]}>@{contact.handle}</Text>
        {online && (
          <Text style={[styles.onlineLabel, { color: "#34C759" }]}>● Active now</Text>
        )}
        {contact.bio ? (
          <Text style={[styles.detailBio, { color: colors.textSecondary }]} numberOfLines={3}>
            {contact.bio}
          </Text>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.text }]}>{followersCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Followers</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.text }]}>{followingCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Following</Text>
          </View>
        </View>

        <View style={styles.actionBtns}>
          <TouchableOpacity
            style={[styles.msgBtn, { backgroundColor: colors.accent }]}
            onPress={onMessage}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble" size={16} color="#fff" />
            <Text style={styles.msgBtnText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.followBtn,
              isFollowing
                ? { borderColor: colors.border, backgroundColor: colors.surface }
                : { borderColor: colors.accent, backgroundColor: "transparent" },
            ]}
            onPress={toggleFollow}
            disabled={followLoading}
            activeOpacity={0.85}
          >
            {followLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[styles.followBtnText, { color: isFollowing ? colors.textSecondary : colors.accent }]}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.profileBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: contact.id } })}
            activeOpacity={0.85}
          >
            <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.postsSection}>
        <Text style={[styles.postsSectionTitle, { color: colors.textMuted }]}>Posts</Text>
        {postsLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : posts.length === 0 ? (
          <View style={styles.emptyPosts}>
            <Ionicons name="images-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyPostsText, { color: colors.textMuted }]}>No posts yet</Text>
          </View>
        ) : (
          <View style={styles.postsGrid}>
            {posts.map((p) => {
              const thumb = getBestThumb(p);
              const isVideo = p.post_type === "video";
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.gridThumb}
                  onPress={() => router.push({ pathname: isVideo ? "/video/[id]" : "/post/[id]", params: { id: p.id } })}
                  activeOpacity={0.8}
                >
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.gridThumbImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.gridThumbImg, { backgroundColor: isDark ? "#1a1a1d" : "#e5e5ea", alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name={isVideo ? "play-circle-outline" : "image-outline"} size={28} color={isDark ? "#555" : "#aaa"} />
                    </View>
                  )}
                  {isVideo && (
                    <View style={styles.gridVideoOverlay}>
                      <Ionicons name="play" size={18} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function AddContactSheet({
  colors,
  userId,
  onDone,
}: {
  colors: any;
  userId: string;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Contact | null>(null);
  const [searching, setSearching] = useState(false);
  const [following, setFollowing] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, last_seen, show_online_status")
      .or(`handle.ilike.%${query.trim()}%,display_name.ilike.%${query.trim()}%`)
      .neq("id", userId)
      .limit(1)
      .single();
    setResult(data as Contact | null);
    setSearching(false);
  }

  async function follow() {
    if (!result) return;
    setFollowing(true);
    await supabase.from("follows").upsert({ follower_id: userId, following_id: result.id });
    setFollowing(false);
    onDone();
  }

  return (
    <View style={[styles.addSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.addField, { backgroundColor: colors.inputBg }]}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={[styles.addInput, { color: colors.text }]}
          placeholder="Search by handle or name…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          autoFocus
          autoCapitalize="none"
          returnKeyType="search"
        />
        <TouchableOpacity onPress={search}>
          <Ionicons name="arrow-forward-circle" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>
      {searching && <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />}
      {result && (
        <View style={styles.addResult}>
          <Avatar uri={result.avatar_url} name={result.display_name} size={40} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{result.display_name}</Text>
              <VerifiedBadge isVerified={result.is_verified} isOrganizationVerified={result.is_organization_verified} size={12} />
            </View>
            <Text style={[styles.rowHandle, { color: colors.textSecondary }]}>@{result.handle}</Text>
          </View>
          <TouchableOpacity
            style={[styles.followPill, { backgroundColor: colors.accent }]}
            onPress={follow}
            disabled={following}
          >
            {following ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.followPillText}>Follow</Text>}
          </TouchableOpacity>
        </View>
      )}
      {!searching && query.trim() && !result && (
        <Text style={[styles.noResult, { color: colors.textMuted }]}>No user found</Text>
      )}
    </View>
  );
}

export function DesktopContactsSection() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("follows")
      .select("following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, last_seen, show_online_status)")
      .eq("follower_id", user.id);
    if (data) {
      const list = data
        .map((f: any) => f.profiles)
        .filter(Boolean)
        .sort((a: Contact, b: Contact) => a.display_name.localeCompare(b.display_name));
      setContacts(list);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`desktop-contacts:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${user.id}` }, loadContacts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadContacts]);

  async function openMessage(contact: Contact) {
    if (!user) return;
    const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: contact.id });
    if (error || !chatId) {
      showAlert("Error", "Could not open conversation.");
      return;
    }
    router.push({ pathname: "/chat/[id]", params: { id: chatId } });
  }

  const filtered = search
    ? contacts.filter((c) =>
        c.display_name.toLowerCase().includes(search.toLowerCase()) ||
        c.handle.toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  const sections = groupByLetter(filtered);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Left panel */}
      <View style={[styles.leftPanel, { borderRightColor: colors.border }]}>
        <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Contacts</Text>
          <TouchableOpacity
            onPress={() => setAdding((v) => !v)}
            style={[styles.addBtn, adding && { backgroundColor: colors.accent + "22" }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={adding ? "close" : "person-add-outline"} size={20} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {adding && user && (
          <AddContactSheet
            colors={colors}
            userId={user.id}
            onDone={() => { setAdding(false); loadContacts(); }}
          />
        )}

        <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="search-outline" size={15} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search contacts"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={15} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Ionicons name="people-outline" size={44} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {search ? "No matches" : "No contacts yet"}
            </Text>
            {!search && (
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Tap the + icon to follow people
              </Text>
            )}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {!search && (
              <Text style={[styles.countLabel, { color: colors.accent }]}>
                {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
              </Text>
            )}
            {sections.map((sec) => (
              <View key={sec.letter}>
                <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary ?? colors.background }]}>
                  <Text style={[styles.sectionLetter, { color: colors.textMuted }]}>{sec.letter}</Text>
                </View>
                {sec.data.map((c) => (
                  <ContactRow
                    key={c.id}
                    item={c}
                    isSelected={selected?.id === c.id}
                    onSelect={() => setSelected(c)}
                    colors={colors}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Right panel */}
      <View style={[styles.rightPanel, { backgroundColor: colors.background }]}>
        {selected ? (
          <ContactDetail
            contact={selected}
            colors={colors}
            isDark={isDark}
            currentUserId={user?.id ?? ""}
            onMessage={() => openMessage(selected)}
          />
        ) : (
          <View style={styles.emptyRight}>
            <Ionicons name="person-circle-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyRightTitle, { color: colors.text }]}>Select a contact</Text>
            <Text style={[styles.emptyRightSub, { color: colors.textSecondary }]}>
              Choose someone from the list to view their profile
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },

  leftPanel: {
    width: 300,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexDirection: "column",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  addSheet: {
    margin: 12,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  addField: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    gap: 6,
  },
  addInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  addResult: { flexDirection: "row", alignItems: "center", gap: 10 },
  followPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    minWidth: 60,
    alignItems: "center",
  },
  followPillText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  noResult: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 4 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", height: 38 },

  countLabel: { fontSize: 12, fontFamily: "Inter_500Medium", paddingHorizontal: 16, paddingVertical: 6 },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 5 },
  sectionLetter: { fontSize: 12, fontFamily: "Inter_700Bold" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 10,
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#34C759",
    borderWidth: 2,
  },
  rowText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  rightPanel: { flex: 1 },
  emptyRight: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyRightTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyRightSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  detailHeader: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  onlineDotLg: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#34C759",
    borderWidth: 3,
  },
  detailNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  detailName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  detailHandle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  onlineLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  detailBio: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 360, lineHeight: 21 },

  statsRow: { flexDirection: "row", alignItems: "center", gap: 0, marginTop: 8 },
  stat: { alignItems: "center", paddingHorizontal: 24, gap: 2 },
  statNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28 },

  actionBtns: { flexDirection: "row", gap: 10, marginTop: 12 },
  msgBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 6,
  },
  msgBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  followBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  },
  followBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  profileBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },

  postsSection: { paddingHorizontal: 16, paddingTop: 16 },
  postsSectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  postsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  gridThumb: {
    width: "31.5%",
    aspectRatio: 1,
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
  },
  gridThumbImg: {
    width: "100%",
    height: "100%",
  },
  gridVideoOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPosts: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyPostsText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
