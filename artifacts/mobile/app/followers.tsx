import React, { useCallback, useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";

type FollowUser = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  current_grade: string;
  follower_count: number;
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
  const [search, setSearch] = useState("");
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [togglingFollow, setTogglingFollow] = useState<string | null>(null);

  const isOwnProfile = user?.id === userId;
  const title = type === "followers" ? "Followers" : "Following";

  useEffect(() => {
    if (!userId) return;
    loadPrivacyAndUsers();
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

  const loadPrivacyAndUsers = async () => {
    setLoading(true);
    setUsers([]);

    const followCol = type === "followers" ? "following_id" : "follower_id";
    const joinCol = type === "followers" ? "follower_id" : "following_id";

    const { data: followRows } = await supabase
      .from("follows")
      .select(joinCol)
      .eq(followCol, userId);

    if (!followRows || followRows.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const userIds = followRows.map((r: any) => r[joinCol]);

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

    const visibleIds = userIds.filter((id: string) => !blockedIds.includes(id));

    if (visibleIds.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, current_grade, follower_count")
      .in("id", visibleIds);

    if (profiles) {
      setUsers(profiles as FollowUser[]);
    }

    if (user) {
      const { data: myFollowing } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .in("following_id", visibleIds);
      if (myFollowing) {
        setFollowingIds(new Set(myFollowing.map((f: any) => f.following_id)));
      }
    }

    setLoading(false);
  };

  const toggleFollow = useCallback(async (targetId: string) => {
    if (!user || togglingFollow) return;
    setTogglingFollow(targetId);

    const isCurrentlyFollowing = followingIds.has(targetId);

    if (isCurrentlyFollowing) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetId);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: targetId });
      setFollowingIds((prev) => new Set(prev).add(targetId));
    }

    setTogglingFollow(null);
  }, [user, followingIds, togglingFollow]);

  const renderUser = useCallback(({ item }: { item: FollowUser }) => {
    const isMe = item.id === user?.id;
    const amFollowing = followingIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.userRow, { backgroundColor: colors.surface }]}
        activeOpacity={0.6}
        onPress={() => {
          if (isMe) {
            router.push("/(tabs)/me");
          } else {
            router.push({ pathname: "/contact/[id]", params: { id: item.id, init_name: item.display_name, init_handle: item.handle, init_avatar: item.avatar_url ?? "", init_verified: item.is_verified ? "1" : "0", init_org_verified: item.is_organization_verified ? "1" : "0" } });
          }
        }}
      >
        <Avatar uri={item.avatar_url} name={item.display_name} size={48} square={!!(item.is_organization_verified)} />
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
              {item.display_name}
            </Text>
            {item.is_verified && <VerifiedBadge size={14} />}
            {item.is_organization_verified && (
              <View style={[styles.orgBadge, { backgroundColor: colors.accent + "20" }]}>
                <Ionicons name="business" size={10} color={colors.accent} />
              </View>
            )}
            <PrestigeBadge grade={item.current_grade} size={14} />
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
              amFollowing
                ? [styles.followBtnFollowing, { borderColor: colors.border }]
                : { backgroundColor: colors.accent },
            ]}
            onPress={(e) => {
              e.stopPropagation?.();
              toggleFollow(item.id);
            }}
            disabled={togglingFollow === item.id}
          >
            {togglingFollow === item.id ? (
              <ActivityIndicator size="small" color={amFollowing ? colors.text : "#fff"} />
            ) : (
              <Text
                style={[
                  styles.followBtnText,
                  { color: amFollowing ? colors.text : "#fff" },
                ]}
              >
                {amFollowing ? "Following" : "Follow"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [colors, user, followingIds, togglingFollow, toggleFollow]);

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
          <Ionicons name="arrow-back" size={24} color={colors.text} />
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
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: 76 }]} />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name={type === "followers" ? "people-outline" : "person-add-outline"}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
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

  separator: { height: StyleSheet.hairlineWidth },

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
