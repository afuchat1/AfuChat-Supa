import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { StoryRing } from "@/components/ui/StoryRing";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import Colors from "@/constants/colors";

type StoryUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  storyCount: number;
  seenCount: number;
  hasUnseen: boolean;
  latestAt: string;
};

export default function MomentsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);

  const loadStories = useCallback(async () => {
    try {
      const now = new Date().toISOString();

      // Try the join shape first; fall back to a manual profile fetch if the
      // FK alias isn't recognised by the Supabase project (this is the most
      // common cause of "Something went wrong" on /moments in production).
      let storiesData: any[] | null = null;
      let needsManualProfiles = false;

      const joined = await supabase
        .from("stories")
        .select(
          "id, user_id, caption, privacy, created_at, profiles!stories_user_id_fkey(display_name, avatar_url)"
        )
        .gt("expires_at", now)
        .eq("privacy", "everyone")
        .order("created_at", { ascending: false })
        .limit(200);

      if (joined.error) {
        const fallback = await supabase
          .from("stories")
          .select("id, user_id, caption, privacy, created_at")
          .gt("expires_at", now)
          .eq("privacy", "everyone")
          .order("created_at", { ascending: false })
          .limit(200);
        if (fallback.error) {
          setStoryUsers([]);
          setLoading(false);
          return;
        }
        storiesData = fallback.data as any[];
        needsManualProfiles = true;
      } else {
        storiesData = joined.data as any[];
      }

      if (!storiesData || storiesData.length === 0) {
        setStoryUsers([]);
        setLoading(false);
        return;
      }

      // Manual profile join when the FK alias isn't available.
      let profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      if (needsManualProfiles) {
        const userIds = [...new Set(storiesData.map((s: any) => s.user_id as string))];
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        for (const p of (profilesData || []) as any[]) {
          profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url });
        }
      }

      const storyIds = storiesData.map((s: any) => s.id);
      let viewedSet = new Set<string>();

      if (user) {
        const { data: viewsData } = await supabase
          .from("story_views")
          .select("story_id")
          .eq("viewer_id", user.id)
          .in("story_id", storyIds);
        viewedSet = new Set((viewsData || []).map((v: any) => v.story_id));
      }

      const userMap = new Map<string, StoryUser>();
      for (const s of storiesData as any[]) {
        const isSeen = viewedSet.has(s.id);
        const existing = userMap.get(s.user_id);
        const profile = needsManualProfiles
          ? profileMap.get(s.user_id) || null
          : (s.profiles as any) || null;
        if (existing) {
          existing.storyCount += 1;
          if (isSeen) existing.seenCount += 1;
          if (!isSeen) existing.hasUnseen = true;
          if (s.created_at > existing.latestAt) existing.latestAt = s.created_at;
        } else {
          userMap.set(s.user_id, {
            userId: s.user_id,
            displayName: profile?.display_name || "User",
            avatarUrl: profile?.avatar_url || null,
            hasUnseen: !isSeen,
            storyCount: 1,
            seenCount: isSeen ? 1 : 0,
            latestAt: s.created_at,
          });
        }
      }

      const users = Array.from(userMap.values());
      users.sort((a, b) => {
        if (a.hasUnseen && !b.hasUnseen) return -1;
        if (!a.hasUnseen && b.hasUnseen) return 1;
        return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
      });

      setStoryUsers(users);
    } catch (err) {
      // Never let the screen crash the app's error boundary — show empty state.
      console.warn("[moments] loadStories failed:", err);
      setStoryUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadStories();
    }, [loadStories])
  );

  useEffect(() => {
    try {
      channelRef.current = supabase
        .channel("moments-page-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stories" },
          () => {
            loadStories();
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[moments] realtime subscribe failed:", err);
    }
    return () => {
      try {
        if (channelRef.current) supabase.removeChannel(channelRef.current);
      } catch {}
    };
  }, [loadStories]);

  const renderItem = useCallback(
    ({ item }: { item: StoryUser }) => (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() =>
          router.push({
            pathname: "/stories/view",
            params: { userId: item.userId },
          })
        }
        activeOpacity={0.8}
      >
        <StoryRing
          size={56}
          storyCount={item.storyCount}
          seenCount={item.seenCount}
        >
          <Avatar uri={item.avatarUrl} name={item.displayName} size={56} />
        </StoryRing>
        <View style={styles.cardInfo}>
          <Text
            style={[styles.cardName, { color: colors.text }]}
            numberOfLines={1}
          >
            {item.displayName}
          </Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
            {item.storyCount} {item.storyCount === 1 ? "moment" : "moments"}
          </Text>
        </View>
        {item.hasUnseen && (
          <View style={[styles.unseenDot, { backgroundColor: Colors.brand }]} />
        )}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
    ),
    [colors]
  );

  const isDesktop = Platform.OS === "web";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: isDesktop ? 0 : insets.top,
        },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {!isDesktop && (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Moments
        </Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push("/stories/camera")}
        >
          <Ionicons name="add-circle-outline" size={24} color={Colors.brand} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ padding: 12, gap: 10 }}>
          {[1,2,3,4,5,6].map(i => <ListRowSkeleton key={i} />)}
        </View>
      ) : storyUsers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons
            name="images-outline"
            size={52}
            color={colors.textSecondary}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No moments yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Be the first to share a moment with everyone
          </Text>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: Colors.brand }]}
            onPress={() => router.push("/stories/camera")}
          >
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.createBtnText}>Create Moment</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={storyUsers}
          keyExtractor={(item) => item.userId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    marginRight: 8,
    padding: 2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
  },
  addBtn: {
    padding: 4,
  },
  list: {
    padding: 12,
    gap: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
  },
  cardSub: {
    fontSize: 13,
    marginTop: 2,
  },
  unseenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    marginTop: 8,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
