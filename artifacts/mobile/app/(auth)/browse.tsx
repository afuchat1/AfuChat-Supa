import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { useAutoTranslate } from "@/context/LanguageContext";
import { LANG_LABELS } from "@/lib/translate";

const { width } = Dimensions.get("window");

type PublicPost = {
  id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  likeCount: number;
  replyCount: number;
  profile: { display_name: string; handle: string; avatar_url: string | null; is_verified: boolean };
};

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function AvatarCircle({ uri, name, size = 40 }: { uri: string | null; name: string; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  const initial = (name || "?")[0].toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.brand + "33", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.42, fontFamily: "Inter_700Bold", color: Colors.brand }}>{initial}</Text>
    </View>
  );
}

function PublicPostCard({ item, index }: { item: PublicPost; index: number }) {
  const { displayText, isTranslated, lang } = useAutoTranslate(item.content);
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 80, useNativeDriver: true }),
    ]).start();
  }, []);

  const hasImage = !!(item.image_url || (item.images && item.images.length > 0));
  const imgUrl = item.image_url || item.images?.[0];

  return (
    <Animated.View style={[styles.postCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {/* Author row */}
      <View style={styles.authorRow}>
        <AvatarCircle uri={item.profile.avatar_url} name={item.profile.display_name} size={44} />
        <View style={{ flex: 1 }}>
          <View style={styles.authorNameRow}>
            <Text style={styles.authorName} numberOfLines={1}>{item.profile.display_name}</Text>
            {item.profile.is_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.brand} />}
          </View>
          <Text style={styles.authorHandle}>@{item.profile.handle} · {formatRelative(item.created_at)}</Text>
        </View>
        <TouchableOpacity
          style={styles.followBtn}
          onPress={() => router.push("/(auth)/register")}
        >
          <Text style={styles.followBtnText}>Follow</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <Text style={styles.postContent} numberOfLines={hasImage ? 3 : 7}>{displayText}</Text>
      {isTranslated && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 4 }}>
          <Ionicons name="language" size={10} color="#6B7A8D" />
          <Text style={{ fontSize: 10, color: "#6B7A8D" }}>
            {`Translated · ${LANG_LABELS[lang || ""] ?? lang}`}
          </Text>
        </View>
      )}

      {/* Image */}
      {hasImage && imgUrl && (
        <View style={styles.imgWrap}>
          <Image source={{ uri: imgUrl }} style={styles.postImg} resizeMode="cover" />
        </View>
      )}

      {/* Locked interaction bar */}
      <TouchableOpacity
        style={styles.interactionBar}
        onPress={() => router.push("/(auth)/register")}
        activeOpacity={0.9}
      >
        <View style={styles.interactionInner}>
          <View style={styles.interactionStat}>
            <Ionicons name="heart-outline" size={18} color="#6B7A8D" />
            <Text style={styles.interactionCount}>{item.likeCount || 0}</Text>
          </View>
          <View style={styles.interactionStat}>
            <Ionicons name="chatbubble-outline" size={17} color="#6B7A8D" />
            <Text style={styles.interactionCount}>{item.replyCount || 0}</Text>
          </View>
          <View style={styles.interactionStat}>
            <Ionicons name="eye-outline" size={18} color="#6B7A8D" />
            <Text style={styles.interactionCount}>{item.view_count || 0}</Text>
          </View>
          <View style={styles.interactionLocked}>
            <Ionicons name="lock-closed" size={13} color={Colors.brand} />
            <Text style={styles.interactionLockedText}>Join to interact</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function JoinNudgeBanner() {
  return (
    <View style={styles.nudgeBarOuter} pointerEvents="box-none">
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.nudgeBarContent}>
        <View style={{ flex: 1 }}>
          <Text style={styles.nudgeTitle}>You're browsing as a guest</Text>
          <Text style={styles.nudgeSub}>Create an account to like, comment, follow, and chat</Text>
        </View>
        <TouchableOpacity
          style={styles.nudgeBtn}
          onPress={() => router.push("/(auth)/register")}
          activeOpacity={0.88}
        >
          <LinearGradient colors={[Colors.brand, "#00A8B0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
          <Text style={styles.nudgeBtnText}>Join Free</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const fetchPosts = useCallback(async (pageNum = 0) => {
    if (pageNum === 0) setLoading(true);
    const PAGE_SIZE = 15;
    const { data } = await supabase
      .from("posts")
      .select(`
        id, content, image_url, images, created_at, view_count,
        profiles!author_id ( display_name, handle, avatar_url, is_verified ),
        likes:post_likes(count),
        replies:post_replies(count)
      `)
      .order("created_at", { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    if (data) {
      const mapped: PublicPost[] = data.map((p: any) => ({
        id: p.id,
        content: p.content,
        image_url: p.image_url,
        images: p.images || [],
        created_at: p.created_at,
        view_count: p.view_count || 0,
        likeCount: p.likes?.[0]?.count ?? 0,
        replyCount: p.replies?.[0]?.count ?? 0,
        profile: p.profiles ?? { display_name: "User", handle: "user", avatar_url: null, is_verified: false },
      }));
      setPosts((prev) => pageNum === 0 ? mapped : [...prev, ...mapped]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(0); }, [fetchPosts]);

  return (
    <View style={[styles.root, { backgroundColor: "#070B0F" }]}>
      {/* Header */}
      <LinearGradient colors={["#0D1117", "#0D111700"]} style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>AfuChat</Text>
          <Text style={styles.headerSub}>Discover what people are sharing</Text>
        </View>
        <TouchableOpacity style={styles.signInBtn} onPress={() => router.push("/(auth)/login")}>
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signupHeaderBtn} onPress={() => router.push("/(auth)/register")}>
          <Text style={styles.signupHeaderText}>Join Free</Text>
        </TouchableOpacity>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.brand} size="large" />
          <Text style={styles.loadingText}>Loading public feed…</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <PublicPostCard item={item} index={index} />}
          contentContainerStyle={{ paddingTop: 80, paddingBottom: insets.bottom + 110, paddingHorizontal: 14, gap: 10 }}
          showsVerticalScrollIndicator={false}
          onEndReached={() => { setPage((p) => { fetchPosts(p + 1); return p + 1; }); }}
          onEndReachedThreshold={0.4}
        />
      )}

      {/* Fixed bottom nudge bar */}
      <View style={[styles.nudgeBarOuter, { bottom: insets.bottom }]} pointerEvents="box-none">
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.nudgeBarContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nudgeTitle}>You're browsing as a guest</Text>
            <Text style={styles.nudgeSub}>Join to like, comment, follow & chat</Text>
          </View>
          <TouchableOpacity
            style={styles.nudgeBtn}
            onPress={() => router.push("/(auth)/register")}
            activeOpacity={0.88}
          >
            <LinearGradient colors={[Colors.brand, "#00A8B0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
            <Text style={styles.nudgeBtnText}>Join Free</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF15", alignItems: "center", justifyContent: "center" },
  signInBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#FFFFFF22" },
  signInBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7A8D" },
  signupHeaderBtn: { backgroundColor: Colors.brand, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  signupHeaderText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },

  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6B7A8D" },

  postCard: { backgroundColor: "#111822", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#FFFFFF0F" },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  authorNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  authorName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff", maxWidth: width * 0.35 },
  authorHandle: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A8D", marginTop: 1 },
  followBtn: { backgroundColor: Colors.brand + "22", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.brand + "44" },
  followBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: Colors.brand },

  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#C8D3E0", lineHeight: 22, marginBottom: 12 },
  imgWrap: { borderRadius: 12, overflow: "hidden", marginBottom: 12 },
  postImg: { width: "100%", height: 200 },

  interactionBar: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#FFFFFF10", paddingTop: 10 },
  interactionInner: { flexDirection: "row", alignItems: "center", gap: 16 },
  interactionStat: { flexDirection: "row", alignItems: "center", gap: 5 },
  interactionCount: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#6B7A8D" },
  interactionLocked: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto" as any, backgroundColor: Colors.brand + "18", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  interactionLockedText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.brand },

  nudgeBarOuter: { position: "absolute", left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#FFFFFF15", overflow: "hidden" },
  nudgeBarContent: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  nudgeTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  nudgeSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7A8D", marginTop: 1 },
  nudgeBtn: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22, overflow: "hidden" },
  nudgeBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },

});
