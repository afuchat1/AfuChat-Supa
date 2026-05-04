import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";

const GOLD = "#D4A853";
const BRAND = "#00BCD4";

type OrgPage = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  website: string | null;
  email: string | null;
  industry: string | null;
  org_type: string | null;
  size: string | null;
  founded_year: number | null;
  location: string | null;
  social_links: Record<string, string>;
  admin_id: string;
  is_verified: boolean;
  followers_count: number;
  posts_count: number;
};

type PagePost = {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  author_id: string;
  likes: number;
};

export default function CompanyPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors, isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [page, setPage] = useState<OrgPage | null>(null);
  const [posts, setPosts] = useState<PagePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);

  const isAdmin = page?.admin_id === user?.id;
  const headerTop = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  const load = useCallback(async () => {
    if (!slug) return;
    const { data: pageData } = await supabase
      .from("organization_pages")
      .select("*")
      .eq("slug", slug)
      .single();

    if (!pageData) { setLoading(false); return; }
    setPage(pageData as OrgPage);

    const [{ data: postsData }, followCheck] = await Promise.all([
      supabase
        .from("organization_page_posts")
        .select("id, content, image_url, created_at, author_id, likes")
        .eq("page_id", pageData.id)
        .order("created_at", { ascending: false })
        .limit(30),
      user
        ? supabase
            .from("organization_page_followers")
            .select("id")
            .eq("page_id", pageData.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setPosts((postsData ?? []) as PagePost[]);
    setFollowing(!!followCheck.data);
    setLoading(false);
    setRefreshing(false);
  }, [slug, user?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  async function toggleFollow() {
    if (!user) { router.push("/(auth)/sign-in"); return; }
    if (!page) return;
    setFollowLoading(true);
    if (following) {
      await supabase
        .from("organization_page_followers")
        .delete()
        .eq("page_id", page.id)
        .eq("user_id", user.id);
      setFollowing(false);
      setPage((p) => p ? { ...p, followers_count: Math.max(0, p.followers_count - 1) } : p);
    } else {
      await supabase
        .from("organization_page_followers")
        .insert({ page_id: page.id, user_id: user.id });
      setFollowing(true);
      setPage((p) => p ? { ...p, followers_count: p.followers_count + 1 } : p);
    }
    setFollowLoading(false);
  }

  async function submitPost() {
    if (!postText.trim() || !page || !user) return;
    setPosting(true);
    const { error } = await supabase.from("organization_page_posts").insert({
      page_id: page.id,
      author_id: user.id,
      content: postText.trim(),
    });
    setPosting(false);
    if (error) { showAlert("Error", "Could not publish update."); return; }
    setPostText("");
    setShowPostModal(false);
    load();
  }

  async function deletePost(postId: string) {
    showAlert("Delete update?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          await supabase.from("organization_page_posts").delete().eq("id", postId);
          setPosts((p) => p.filter((x) => x.id !== postId));
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.text }]}>Company Page</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </View>
    );
  }

  if (!page) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.text }]}>Not Found</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Ionicons name="business-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>This page doesn't exist.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Nav */}
      <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={1}>{page.name}</Text>
        {isAdmin ? (
          <TouchableOpacity onPress={() => router.push(`/company/manage?slug=${page.slug}` as any)} hitSlop={12}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Cover */}
            <View style={[styles.cover, { backgroundColor: isDark ? "#1a1a1a" : "#e8f4f8" }]}>
              {page.cover_url ? (
                <Image source={{ uri: page.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="business" size={40} color={isDark ? "#333" : "#cde"} />
                </View>
              )}
            </View>

            {/* Logo + header */}
            <View style={[styles.headerCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.logo, { borderColor: colors.background }]}>
                {page.logo_url ? (
                  <Image source={{ uri: page.logo_url }} style={{ width: "100%", height: "100%", borderRadius: 12 }} resizeMode="cover" />
                ) : (
                  <View style={[styles.logoFallback, { backgroundColor: BRAND }]}>
                    <Text style={styles.logoFallbackText}>{page.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
              </View>

              <View style={styles.headerInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={[styles.pageName, { color: colors.text }]}>{page.name}</Text>
                  {page.is_verified && (
                    <View style={[styles.verifiedBadge, { backgroundColor: GOLD + "22" }]}>
                      <Ionicons name="checkmark-circle" size={14} color={GOLD} />
                      <Text style={[styles.verifiedText, { color: GOLD }]}>Verified</Text>
                    </View>
                  )}
                </View>
                {page.tagline ? <Text style={[styles.tagline, { color: colors.textSecondary }]}>{page.tagline}</Text> : null}
                <View style={styles.metaRow}>
                  {page.industry ? <MetaChip icon="briefcase-outline" text={page.industry} colors={colors} /> : null}
                  {page.location ? <MetaChip icon="location-outline" text={page.location} colors={colors} /> : null}
                  {page.size ? <MetaChip icon="people-outline" text={page.size} colors={colors} /> : null}
                </View>

                {/* Stats row */}
                <View style={styles.statsRow}>
                  <StatItem value={page.followers_count} label="Followers" />
                  <StatItem value={page.posts_count} label="Updates" />
                </View>

                {/* Follow / manage buttons */}
                <View style={styles.actionRow}>
                  {!isAdmin && (
                    <TouchableOpacity
                      style={[styles.followBtn, { backgroundColor: following ? colors.surface : BRAND, borderColor: following ? colors.border : BRAND, borderWidth: 1 }]}
                      onPress={toggleFollow}
                      disabled={followLoading}
                      activeOpacity={0.8}
                    >
                      {followLoading ? (
                        <ActivityIndicator size="small" color={following ? colors.text : "#fff"} />
                      ) : (
                        <>
                          <Ionicons name={following ? "checkmark" : "add"} size={16} color={following ? colors.text : "#fff"} />
                          <Text style={[styles.followBtnText, { color: following ? colors.text : "#fff" }]}>
                            {following ? "Following" : "Follow"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  {isAdmin && (
                    <TouchableOpacity
                      style={[styles.followBtn, { backgroundColor: BRAND }]}
                      onPress={() => setShowPostModal(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={[styles.followBtnText, { color: "#fff" }]}>Post Update</Text>
                    </TouchableOpacity>
                  )}
                  {page.website ? (
                    <TouchableOpacity
                      style={[styles.websiteBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => Linking.openURL(page.website!.startsWith("http") ? page.website! : `https://${page.website}`)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="globe-outline" size={16} color={colors.text} />
                      <Text style={[styles.websiteBtnText, { color: colors.text }]}>Website</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* About section */}
              {page.description ? (
                <View style={[styles.aboutBox, { borderTopColor: colors.border }]}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ABOUT</Text>
                  <Text style={[styles.aboutText, { color: colors.textSecondary }]}>{page.description}</Text>
                </View>
              ) : null}

              {/* Details */}
              {(page.founded_year || page.email || page.org_type) ? (
                <View style={[styles.detailsBox, { borderTopColor: colors.border }]}>
                  {page.org_type && <DetailRow icon="business-outline" text={page.org_type} colors={colors} />}
                  {page.founded_year && <DetailRow icon="calendar-outline" text={`Founded ${page.founded_year}`} colors={colors} />}
                  {page.email && <DetailRow icon="mail-outline" text={page.email} colors={colors} />}
                </View>
              ) : null}
            </View>

            {/* Posts header */}
            <View style={[styles.postsHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.postsHeaderText, { color: colors.text }]}>Updates</Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => setShowPostModal(true)} hitSlop={8}>
                  <Ionicons name="add-circle-outline" size={22} color={BRAND} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyPosts}>
            <Ionicons name="newspaper-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyPostsText, { color: colors.textMuted }]}>No updates yet.</Text>
            {isAdmin && (
              <TouchableOpacity onPress={() => setShowPostModal(true)} style={[styles.emptyPostsBtn, { backgroundColor: BRAND }]} activeOpacity={0.8}>
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Post your first update</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.postHeader}>
              <View style={[styles.postLogo, { backgroundColor: BRAND }]}>
                {page.logo_url
                  ? <Image source={{ uri: page.logo_url }} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
                  : <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 11 }}>{page.name.slice(0, 1)}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.postPageName, { color: colors.text }]}>{page.name}</Text>
                <Text style={[styles.postDate, { color: colors.textMuted }]}>
                  {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
              {isAdmin && (
                <TouchableOpacity onPress={() => deletePost(item.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.postContent, { color: colors.text }]}>{item.content}</Text>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.postImage} resizeMode="cover" />
            ) : null}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />

      {/* Post update modal */}
      <Modal visible={showPostModal} transparent animationType="slide" onRequestClose={() => setShowPostModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPostModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Post an Update</Text>
              <TextInput
                style={[styles.postInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder={`Share an update from ${page.name}…`}
                placeholderTextColor={colors.textMuted}
                value={postText}
                onChangeText={setPostText}
                multiline
                numberOfLines={5}
                maxLength={3000}
                autoFocus
              />
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{postText.length}/3000</Text>
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: BRAND, opacity: posting || !postText.trim() ? 0.6 : 1 }]}
                onPress={submitPost}
                disabled={posting || !postText.trim()}
                activeOpacity={0.85}
              >
                {posting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitBtnText}>Publish Update</Text>
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function MetaChip({ icon, text, colors }: { icon: any; text: string; colors: any }) {
  return (
    <View style={[styles.metaChip, { backgroundColor: colors.backgroundSecondary }]}>
      <Ionicons name={icon} size={11} color={colors.textMuted} />
      <Text style={[styles.metaChipText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

function DetailRow({ icon, text, colors }: { icon: any; text: string; colors: any }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={[styles.detailText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: BRAND }]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  cover: { height: 160, width: "100%" },
  headerCard: { padding: 16, gap: 12 },
  logo: { width: 80, height: 80, borderRadius: 14, borderWidth: 3, overflow: "hidden", marginTop: -40 },
  logoFallback: { width: "100%", height: "100%", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold" },
  headerInfo: { gap: 8 },
  pageName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  metaChipText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statsRow: { flexDirection: "row", gap: 24 },
  statItem: { alignItems: "flex-start" },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, color: "#888", fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  followBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  websiteBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  websiteBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  verifiedText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  aboutBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 6 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  aboutText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  detailsBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  postsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  postsHeaderText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  postCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postLogo: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  postPageName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  postDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  postImage: { width: "100%", height: 200, borderRadius: 10, marginTop: 4 },
  emptyPosts: { alignItems: "center", padding: 40, gap: 10 },
  emptyPostsText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  emptyPostsBtn: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  postInput: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 120, textAlignVertical: "top" },
  submitBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
