import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { showAlert } from "@/lib/alert";
import {
  DesktopBadge,
  DesktopButton,
  DesktopEmptyState,
  DesktopIconButton,
  DesktopLoadingState,
  DesktopPageHeader,
  DesktopPanel,
  DesktopSearchInput,
  DesktopSectionShell,
  useDesktopTheme,
  useHover,
} from "./ui";

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
    const l = (c.display_name || "?").charAt(0).toUpperCase();
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
}: {
  item: Contact;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  const online = isOnlineNow(item);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onSelect}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 9,
        backgroundColor: isSelected
          ? t.rowActive
          : hovered
            ? t.rowHover
            : "transparent",
      }}
      {...(hp as any)}
    >
      <View style={{ position: "relative" }}>
        <Avatar uri={item.avatar_url} name={item.display_name} size={40} />
        {online && (
          <View
            style={{
              position: "absolute",
              bottom: 1,
              right: 1,
              width: 11,
              height: 11,
              borderRadius: 6,
              backgroundColor: t.success,
              borderWidth: 2,
              borderColor: t.panelBg,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              color: isSelected ? t.rowActiveText : t.text,
            }}
            numberOfLines={1}
          >
            {item.display_name}
          </Text>
          <VerifiedBadge
            isVerified={item.is_verified}
            isOrganizationVerified={item.is_organization_verified}
            size={12}
          />
        </View>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: t.textMuted,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          @{item.handle}
        </Text>
      </View>
      {isSelected && (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: t.accent,
          }}
        />
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
  currentUserId,
  onMessage,
}: {
  contact: Contact;
  currentUserId: string;
  onMessage: () => void;
}) {
  const t = useDesktopTheme();
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
      const [postsRes, followersRes, followingRes, myFollowRes] =
        await Promise.all([
          supabase
            .from("posts")
            .select(
              "id, image_url, post_type, video_url, post_images(image_url, display_order)",
            )
            .eq("author_id", contact.id)
            .order("created_at", { ascending: false })
            .limit(9),
          supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("following_id", contact.id),
          supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("follower_id", contact.id),
          supabase
            .from("follows")
            .select("id")
            .eq("follower_id", currentUserId)
            .eq("following_id", contact.id)
            .maybeSingle(),
        ]);

      if (postsRes.data) {
        setPosts(
          postsRes.data.map((p: any) => ({
            id: p.id,
            image_url: p.image_url,
            post_type: p.post_type,
            video_url: p.video_url,
            images: (p.post_images || [])
              .sort((a: any, b: any) => a.display_order - b.display_order)
              .map((i: any) => i.image_url),
          })),
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
      await supabase
        .from("follows")
        .upsert({ follower_id: currentUserId, following_id: contact.id });
      setIsFollowing(true);
      setFollowersCount((n) => n + 1);
    }
    setFollowLoading(false);
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Header card */}
      <View
        style={{
          paddingHorizontal: 22,
          paddingTop: 22,
          paddingBottom: 18,
          alignItems: "center",
          borderBottomColor: t.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
          backgroundColor: t.panelHeaderBg,
        }}
      >
        <View style={{ position: "relative" }}>
          <Avatar
            uri={contact.avatar_url}
            name={contact.display_name}
            size={88}
          />
          {online && (
            <View
              style={{
                position: "absolute",
                bottom: 4,
                right: 4,
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: t.success,
                borderWidth: 2.5,
                borderColor: t.panelHeaderBg,
              }}
            />
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 12,
          }}
        >
          <Text
            style={{
              fontSize: 19,
              fontFamily: "Inter_700Bold",
              color: t.text,
              letterSpacing: -0.3,
            }}
          >
            {contact.display_name}
          </Text>
          <VerifiedBadge
            isVerified={contact.is_verified}
            isOrganizationVerified={contact.is_organization_verified}
            size={17}
          />
        </View>
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_400Regular",
            color: t.textMuted,
            marginTop: 2,
          }}
        >
          @{contact.handle}
        </Text>
        {online && (
          <View style={{ marginTop: 6 }}>
            <DesktopBadge label="Active now" tone="success" size="sm" />
          </View>
        )}
        {contact.bio ? (
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              color: t.textMuted,
              textAlign: "center",
              marginTop: 12,
              lineHeight: 19,
              maxWidth: 380,
            }}
            numberOfLines={3}
          >
            {contact.bio}
          </Text>
        ) : null}

        {/* Stats */}
        <View
          style={{
            flexDirection: "row",
            gap: 28,
            marginTop: 16,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 17,
                fontFamily: "Inter_700Bold",
                color: t.text,
              }}
            >
              {followersCount.toLocaleString()}
            </Text>
            <Text
              style={{
                fontSize: 11.5,
                fontFamily: "Inter_500Medium",
                color: t.textMuted,
                marginTop: 2,
              }}
            >
              Followers
            </Text>
          </View>
          <View
            style={{
              width: StyleSheet.hairlineWidth,
              backgroundColor: t.border,
              alignSelf: "stretch",
            }}
          />
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 17,
                fontFamily: "Inter_700Bold",
                color: t.text,
              }}
            >
              {followingCount.toLocaleString()}
            </Text>
            <Text
              style={{
                fontSize: 11.5,
                fontFamily: "Inter_500Medium",
                color: t.textMuted,
                marginTop: 2,
              }}
            >
              Following
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 16,
          }}
        >
          <DesktopButton label="Message" icon="chatbubble" onPress={onMessage} />
          <DesktopButton
            label={
              followLoading ? "..." : isFollowing ? "Following" : "Follow"
            }
            variant={isFollowing ? "secondary" : "primary"}
            onPress={toggleFollow}
            disabled={followLoading}
          />
          <DesktopIconButton
            icon="person-outline"
            variant="filled"
            onPress={() =>
              router.push({
                pathname: "/contact/[id]",
                params: { id: contact.id },
              })
            }
            tooltip="Open full profile"
          />
        </View>
      </View>

      {/* Posts grid */}
      <View style={{ padding: 18 }}>
        <Text
          style={{
            fontSize: 11,
            fontFamily: "Inter_700Bold",
            color: t.textMuted,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Posts
        </Text>
        {postsLoading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
        ) : posts.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 36, gap: 10 }}>
            <Ionicons name="images-outline" size={36} color={t.textMuted} />
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_500Medium",
                color: t.textMuted,
              }}
            >
              No posts yet
            </Text>
          </View>
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {posts.map((p) => {
              const thumb = getBestThumb(p);
              const isVideo = p.post_type === "video";
              return (
                <TouchableOpacity
                  key={p.id}
                  style={{
                    width: "32.6%",
                    aspectRatio: 1,
                    borderRadius: 10,
                    overflow: "hidden",
                    backgroundColor: t.chipBg,
                  }}
                  onPress={() =>
                    router.push({
                      pathname: isVideo ? "/video/[id]" : "/post/[id]",
                      params: { id: p.id },
                    })
                  }
                  activeOpacity={0.85}
                >
                  {thumb ? (
                    <Image
                      source={{ uri: thumb }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: "100%",
                        height: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name={isVideo ? "play-circle-outline" : "image-outline"}
                        size={28}
                        color={t.textMuted}
                      />
                    </View>
                  )}
                  {isVideo && (
                    <View
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="play" size={12} color="#fff" />
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
  userId,
  onDone,
}: {
  userId: string;
  onDone: () => void;
}) {
  const t = useDesktopTheme();
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
      .select(
        "id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, last_seen, show_online_status",
      )
      .or(
        `handle.ilike.%${query.trim()}%,display_name.ilike.%${query.trim()}%`,
      )
      .neq("id", userId)
      .limit(1)
      .single();
    setResult(data as Contact | null);
    setSearching(false);
  }

  async function follow() {
    if (!result) return;
    setFollowing(true);
    await supabase
      .from("follows")
      .upsert({ follower_id: userId, following_id: result.id });
    setFollowing(false);
    onDone();
  }

  return (
    <View
      style={{
        margin: 12,
        marginTop: 0,
        padding: 12,
        borderRadius: 12,
        backgroundColor: t.panelBgRaised,
        borderColor: t.border,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 10,
      }}
    >
      <DesktopSearchInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by handle or name…"
        onSubmit={search}
        autoFocus
        size="sm"
      />
      <DesktopButton
        label={searching ? "Searching…" : "Search"}
        icon="search"
        onPress={search}
        loading={searching}
        size="sm"
        fullWidth
      />
      {result && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingTop: 8,
            borderTopColor: t.border,
            borderTopWidth: StyleSheet.hairlineWidth,
          }}
        >
          <Avatar
            uri={result.avatar_url}
            name={result.display_name}
            size={36}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Text
                style={{
                  fontSize: 13.5,
                  fontFamily: "Inter_600SemiBold",
                  color: t.text,
                }}
                numberOfLines={1}
              >
                {result.display_name}
              </Text>
              <VerifiedBadge
                isVerified={result.is_verified}
                isOrganizationVerified={result.is_organization_verified}
                size={12}
              />
            </View>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_400Regular",
                color: t.textMuted,
              }}
            >
              @{result.handle}
            </Text>
          </View>
          <DesktopButton
            label="Follow"
            size="sm"
            onPress={follow}
            loading={following}
          />
        </View>
      )}
      {!searching && query.trim() && !result && (
        <Text
          style={{
            textAlign: "center",
            fontSize: 12.5,
            fontFamily: "Inter_400Regular",
            color: t.textMuted,
          }}
        >
          No user found
        </Text>
      )}
    </View>
  );
}

export function DesktopContactsSection() {
  const t = useDesktopTheme();
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
      .select(
        "following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, last_seen, show_online_status)",
      )
      .eq("follower_id", user.id);
    if (data) {
      const list = data
        .map((f: any) => f.profiles)
        .filter(Boolean)
        .sort((a: Contact, b: Contact) =>
          (a.display_name || "").localeCompare(b.display_name || ""),
        );
      setContacts(list);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`desktop-contacts:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${user.id}`,
        },
        loadContacts,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, loadContacts]);

  async function openMessage(contact: Contact) {
    if (!user) return;
    const { data: chatId, error } = await supabase.rpc(
      "get_or_create_direct_chat",
      { other_user_id: contact.id },
    );
    if (error || !chatId) {
      showAlert("Error", "Could not open conversation.");
      return;
    }
    router.push({ pathname: "/chat/[id]", params: { id: chatId } });
  }

  const filtered = search
    ? contacts.filter(
        (c) =>
          c.display_name.toLowerCase().includes(search.toLowerCase()) ||
          c.handle.toLowerCase().includes(search.toLowerCase()),
      )
    : contacts;

  const sections = groupByLetter(filtered);

  return (
    <DesktopSectionShell>
      <View style={{ flex: 1, flexDirection: "row", gap: 14 }}>
        {/* Left: list */}
        <DesktopPanel style={{ width: 320 }}>
          <DesktopPageHeader
            icon="people"
            title="Contacts"
            subtitle={
              contacts.length > 0
                ? `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`
                : "Find people to follow"
            }
            right={
              <DesktopIconButton
                icon={adding ? "close" : "person-add-outline"}
                onPress={() => setAdding((v) => !v)}
                variant={adding ? "filled" : "ghost"}
                color={t.accent}
                tooltip={adding ? "Close" : "Add contact"}
              />
            }
          />

          {adding && user && (
            <AddContactSheet
              userId={user.id}
              onDone={() => {
                setAdding(false);
                loadContacts();
              }}
            />
          )}

          <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
            <DesktopSearchInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search contacts"
              size="sm"
            />
          </View>

          {loading ? (
            <DesktopLoadingState />
          ) : filtered.length === 0 ? (
            <DesktopEmptyState
              icon="people-outline"
              title={search ? "No matches" : "No contacts yet"}
              subtitle={
                search
                  ? "Try a different name or handle."
                  : "Tap the + icon to follow people."
              }
            />
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 16 }}
            >
              {sections.map((sec) => (
                <View key={sec.letter}>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingTop: 12,
                      paddingBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Inter_700Bold",
                        color: t.textMuted,
                        letterSpacing: 0.6,
                      }}
                    >
                      {sec.letter}
                    </Text>
                  </View>
                  {sec.data.map((c) => (
                    <ContactRow
                      key={c.id}
                      item={c}
                      isSelected={selected?.id === c.id}
                      onSelect={() => setSelected(c)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </DesktopPanel>

        {/* Right: detail */}
        <DesktopPanel flex={1}>
          {selected ? (
            <ContactDetail
              contact={selected}
              currentUserId={user?.id ?? ""}
              onMessage={() => openMessage(selected)}
            />
          ) : (
            <DesktopEmptyState
              icon="person-circle-outline"
              title="Select a contact"
              subtitle="Choose someone from the list to view their profile."
            />
          )}
        </DesktopPanel>
      </View>
    </DesktopSectionShell>
  );
}
