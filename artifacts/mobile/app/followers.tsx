import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { navigateToProfile } from "@/lib/navigateToProfile";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import {
  ACCOUNT_PROFILE_PRIVACY_COLUMNS,
  fetchAccountProfileMap,
  type SharedProfile,
} from "@/lib/sharedProfiles";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import {
  getAfuChatFollowRecords,
  getAfuChatFollowStatuses,
  setAfuChatFollow,
  type AfuChatFollowProfile,
} from "@/lib/afuchatApi";

type FollowUser = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
};

export default function FollowersScreen() {
  const { userId, type, ownerHandle } = useLocalSearchParams<{
    userId: string;
    type: "followers" | "following";
    ownerHandle?: string;
  }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [filtered, setFiltered] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [listHidden, setListHidden] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [myFollowerIds, setMyFollowerIds] = useState<Set<string>>(new Set());
  const [togglingFollow, setTogglingFollow] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(0);

  const PAGE_SIZE = 20;

  const isOwnProfile = user?.id === userId;
  const title = type === "followers" ? "Followers" : "Following";

  useEffect(() => {
    if (!userId) return;
    pageRef.current = 0;
    loadPrivacyAndUsers(0);
  }, [userId, type]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(users);
    } else {
      const q = search.toLowerCase();
      setFiltered(users.filter((u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.handle.toLowerCase().includes(q)
      ));
    }
  }, [search, users]);

  const loadPrivacyAndUsers = async (page: number) => {
    const isReset = page === 0;
    if (isReset) {
      setLoading(true);
      setUsers([]);
      setLoadError(false);
      setFollowingIds(new Set());
      setMyFollowerIds(new Set());
    }
    try {
      // Enforce visibility privacy: if the list owner has hidden this list, block non-owners
      if (isReset && !isOwnProfile && userId) {
        const { profiles, error } = await fetchAccountProfileMap<SharedProfile>(
          [userId],
          ACCOUNT_PROFILE_PRIVACY_COLUMNS,
        );
        if (error) throw error;
        const privData = profiles.get(userId);
        const fieldName = type === "followers" ? "hide_followers_list" : "hide_following_list";
        if (privData?.[fieldName]) {
          setListHidden(true);
          setLoading(false);
          return;
        } else {
          setListHidden(false);
        }
      }

      const followPage = await getAfuChatFollowRecords(userId, type, PAGE_SIZE, page * PAGE_SIZE);
      if (followPage.error) throw followPage.error;
      if (followPage.hidden && !isOwnProfile) {
        setListHidden(true);
        setLoading(false);
        return;
      }
      setListHidden(false);
      const followRows = followPage.items ?? [];

      let blockedIds: string[] = [];
      if (user) {
        const { data: blocked } = await supabase
          .from("blocked_users")
          .select("blocked_id, blocker_id")
          .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
        if (blocked) {
          blockedIds = blocked.map((b: any) =>
            b.blocker_id === user.id ? b.blocked_id : b.blocker_id
          );
        }
      }

      const profiles = followRows
        .map((row) => row.profile)
        .filter((profile): profile is AfuChatFollowProfile & { display_name: string; handle: string } =>
          typeof profile.display_name === "string" &&
          typeof profile.handle === "string" &&
          !blockedIds.includes(profile.id)
        )
        .map((profile): FollowUser => ({
          id: profile.id,
          display_name: profile.display_name,
          handle: profile.handle,
          avatar_url: profile.avatar_url ?? null,
          bio: profile.bio ?? null,
          is_verified: profile.is_verified === true,
          is_organization_verified: profile.is_organization_verified === true,
        }));

      if (isReset) {
        setUsers(profiles as FollowUser[]);
      } else {
        setUsers(prev => [...prev, ...(profiles as FollowUser[])]);
      }

      const visibleIds = profiles.map((p: any) => p.id);
      setHasMore(followPage.nextOffset !== null);

      if (user && visibleIds.length > 0) {
        const statuses = await getAfuChatFollowStatuses(visibleIds);
        if (statuses.error || !statuses.data) {
          if (__DEV__) {
            console.warn("[Followers] Relationship rows loaded, but follow status lookup failed", {
              code: statuses.error?.code ?? "INVALID_RESPONSE",
              requestId: statuses.error?.requestId ?? null,
              rowCount: visibleIds.length,
            });
          }
        } else {
          const nowFollowing = [...statuses.data.entries()]
            .filter(([, status]) => status.isFollowing)
            .map(([id]) => id);
          const followingYou = [...statuses.data.entries()]
            .filter(([, status]) => status.followsYou)
            .map(([id]) => id);
          setFollowingIds(prev => new Set([...prev, ...nowFollowing]));
          setMyFollowerIds(prev => new Set([...prev, ...followingYou]));
        }
      }
    } catch {
      if (isReset) setLoadError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const toggleFollow = useCallback(async (targetId: string) => {
    if (!user || togglingFollow) return;
    setTogglingFollow(targetId);

    const isCurrentlyFollowing = followingIds.has(targetId);

    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyFollowing) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
    try {
      const { error } = await setAfuChatFollow(targetId, !isCurrentlyFollowing, user.id);
      if (error) throw error;
    } catch {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFollowing) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
      showAlert("Error", "Could not update follow status. Please try again.");
    } finally {
      setTogglingFollow(null);
    }
  }, [user, followingIds, togglingFollow]);

  const renderUser = useCallback(({ item }: { item: FollowUser }) => {
    const isMe = item.id === user?.id;
    const amFollowing = followingIds.has(item.id);
    const theyFollowMe = myFollowerIds.has(item.id);

    // Derive 4-state follow button appearance
    const _fs = amFollowing && theyFollowMe ? "friends" : !amFollowing && theyFollowMe ? "follow_back" : amFollowing ? "following" : "follow";
    const _bg = _fs === "follow" ? colors.accent : _fs === "follow_back" ? "#FF9500" : "transparent";
    const _bw = _fs === "following" || _fs === "friends" ? 1 : 0;
    const _bc = _fs === "friends" ? "#34C759" : _fs === "following" ? colors.border : colors.accent;
    const _tc = _fs === "follow" || _fs === "follow_back" ? "#fff" : _fs === "friends" ? "#34C759" : colors.text;
    const _label = _fs === "follow" ? "Follow" : _fs === "follow_back" ? "Follow Back" : _fs === "following" ? "Following" : "Friends";

    return (
      <TouchableOpacity
        style={[styles.userRow, { backgroundColor: colors.surface }]}
        activeOpacity={0.6}
        onPress={() => {
          if (isMe) {
            router.push("/(tabs)/me");
          } else {
            navigateToProfile(item.handle, true).catch(() => {});
          }
        }}
      >
        <Avatar uri={item.avatar_url} name={item.display_name} size={48} square={!!(item.is_organization_verified)} userId={item.id} />
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <UserName userId={item.id} name={item.display_name} style={[styles.displayName, { color: colors.text }]} numberOfLines={1} />
            {item.is_verified && <VerifiedBadge size={14} />}
            {item.is_organization_verified && (
              <View style={[styles.orgBadge, { backgroundColor: colors.accent + "20" }]}>
                <Ionicons name="business" size={10} color={colors.accent} />
              </View>
            )}
          </View>
          <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
            @{item.handle}
          </Text>
          {item.bio ? (
            <Text style={[styles.bio, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.bio}
            </Text>
          ) : null}
        </View>
        {!isMe && user && (
          <TouchableOpacity
            style={[
              styles.followBtn,
              { backgroundColor: _bg, borderColor: _bc, borderWidth: _bw },
            ]}
            onPress={(e) => {
              e.stopPropagation?.();
              toggleFollow(item.id);
            }}
            disabled={togglingFollow === item.id}
          >
            {togglingFollow === item.id ? (
              <ActivityIndicator size="small" color={_tc} />
            ) : (
              <Text style={[styles.followBtnText, { color: _tc }]}>
                {_label}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [colors, user, followingIds, myFollowerIds, togglingFollow, toggleFollow]);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
          {ownerHandle ? (
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>@{ownerHandle}</Text>
          ) : null}
        </View>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={{ padding: 8, gap: 2 }}>
          {[1,2,3,4,5,6,7,8].map(i => <ContactRowSkeleton key={i} />)}
        </View>
      ) : listHidden ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>This list is private</Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            This account has chosen to keep their {title.toLowerCase()} list hidden.
          </Text>
        </View>
      ) : (
        <>
          {users.length > 5 && (
            <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <View style={[styles.searchBar, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search..."
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch("")}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            ListFooterComponent={hasMore && !search.trim() ? (
              <TouchableOpacity
                onPress={() => {
                  if (loadingMore) return;
                  setLoadingMore(true);
                  pageRef.current += 1;
                  loadPrivacyAndUsers(pageRef.current);
                }}
                disabled={loadingMore}
                style={{ paddingVertical: 16, alignItems: "center" as const }}
              >
                {loadingMore ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={{ color: colors.accent, fontSize: 14 }}>Load more</Text>}
              </TouchableOpacity>
            ) : null}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: 76 }]} />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                {loadError ? (
                  <>
                    <Ionicons name="cloud-offline" size={48} color={colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>Couldn't load this list</Text>
                    <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>Check your connection and try again.</Text>
                    <TouchableOpacity
                      onPress={() => {
                        pageRef.current = 0;
                        loadPrivacyAndUsers(0);
                      }}
                      style={{ paddingVertical: 12 }}
                    >
                      <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name={type === "followers" ? "people" : "person-add"}
                      size={48}
                      color={colors.textMuted}
                    />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>
                      {search ? "No results" : `No ${type}`}
                    </Text>
                    <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                      {search
                        ? `No users matching "${search}"`
                        : type === "followers"
                        ? "No one is following this account yet."
                        : "This account isn't following anyone yet."}
                    </Text>
                  </>
                )}
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
    
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 36,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  userInfo: { flex: 1, gap: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  displayName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  orgBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  bio: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 86,
    alignItems: "center",
    justifyContent: "center",
  },
  followBtnFollowing: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  followBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  separator: { height: 0.5 },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
