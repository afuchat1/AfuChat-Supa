import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { aiGenerateOrgUpdate, aiEnhanceOrgPost, aiGenerateHashtags, aiGenerateJobDescription, aiResearchCompanyAndGenerateAbout } from "@/lib/aiHelper";

const GOLD = "#D4A853";

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
  physical_address: string | null;
  registration_number: string | null;
  jurisdiction_code: string | null;
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

type Follower = {
  user_id: string;
  profiles: {
    id: string;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
};

export default function CompanyPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors, isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [page, setPage] = useState<OrgPage | null>(null);
  const [posts, setPosts] = useState<PagePost[]>([]);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postText, setPostText] = useState("");
  const [postImageUri, setPostImageUri] = useState<string | null>(null);
  const [uploadingPostImage, setUploadingPostImage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [activeTab, setActiveTab] = useState<"updates" | "followers" | "jobs">("updates");
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [jobs, setJobs] = useState<{ id: string; title: string; job_type: string; location: string | null; description: string; apply_url: string | null; created_at: string }[]>([]);
  const [showJobModal, setShowJobModal] = useState(false);
  const [jobForm, setJobForm] = useState({ title: "", job_type: "Full-time", location: "", description: "", apply_url: "" });
  const [postingJob, setPostingJob] = useState(false);
  const [jobAiLoading, setJobAiLoading] = useState(false);
  const [jobAiAboutLoading, setJobAiAboutLoading] = useState(false);

  // My own company pages (for page-to-page follow)
  const [myPages, setMyPages] = useState<{ id: string; name: string; slug: string; logo_url: string | null }[]>([]);
  const [pageFollowing, setPageFollowing] = useState<Record<string, boolean>>({});
  const [showPageFollowModal, setShowPageFollowModal] = useState(false);

  // AI writing assistant state
  const [aiLoading, setAiLoading] = useState<"generate" | "improve" | "hashtags" | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTone, setAiTone] = useState<"professional" | "exciting" | "informative">("professional");

  // Dismissible verify banner (admin only, unverified pages)
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);

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

    const [{ data: postsData }, followCheck, { data: followersData }, { data: myPagesData }, { data: jobsData }] = await Promise.all([
      supabase
        .from("organization_page_posts")
        .select("id, content, image_url, created_at, author_id, likes")
        .eq("page_id", pageData.id)
        .order("created_at", { ascending: false })
        .limit(50),
      user
        ? supabase
            .from("organization_page_followers")
            .select("id")
            .eq("page_id", pageData.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("organization_page_followers")
        .select("user_id, profiles:user_id(id, display_name, handle, avatar_url, is_verified)")
        .eq("page_id", pageData.id)
        .order("created_at", { ascending: false })
        .limit(100),
      user
        ? supabase
            .from("organization_pages")
            .select("id, name, slug, logo_url")
            .eq("admin_id", user.id)
            .neq("slug", slug)
        : Promise.resolve({ data: [] }),
      supabase
        .from("org_page_jobs")
        .select("id, title, job_type, location, description, apply_url, created_at")
        .eq("page_id", pageData.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    setPosts((postsData ?? []) as PagePost[]);
    setFollowers((followersData ?? []) as Follower[]);
    setFollowing(!!followCheck.data);
    setMyPages((myPagesData ?? []) as any[]);
    setJobs((jobsData ?? []) as any[]);

    // Check which of my pages follow this page
    if (myPagesData && myPagesData.length > 0 && pageData.id) {
      const myPageIds = myPagesData.map((p: any) => p.id);
      const { data: pageConns } = await supabase
        .from("organization_page_connections")
        .select("follower_page_id")
        .eq("following_page_id", pageData.id)
        .in("follower_page_id", myPageIds);
      const map: Record<string, boolean> = {};
      (pageConns ?? []).forEach((c: any) => { map[c.follower_page_id] = true; });
      setPageFollowing(map);
    }

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
      setFollowers((prev) => prev.filter((f) => f.user_id !== user.id));
    } else {
      await supabase
        .from("organization_page_followers")
        .insert({ page_id: page.id, user_id: user.id });
      setFollowing(true);
      setPage((p) => p ? { ...p, followers_count: p.followers_count + 1 } : p);
      // Add current user to local followers list
      if (profile) {
        setFollowers((prev) => [
          { user_id: user.id, profiles: {
            id: user.id,
            display_name: profile.display_name ?? null,
            handle: profile.handle ?? null,
            avatar_url: profile.avatar_url ?? null,
            is_verified: profile.is_verified ?? false,
          }},
          ...prev,
        ]);
      }
    }
    setFollowLoading(false);
  }

  async function togglePageFollow(myPageId: string) {
    if (!page) return;
    const alreadyFollowing = pageFollowing[myPageId];
    if (alreadyFollowing) {
      await supabase
        .from("organization_page_connections")
        .delete()
        .eq("follower_page_id", myPageId)
        .eq("following_page_id", page.id);
      setPageFollowing((prev) => ({ ...prev, [myPageId]: false }));
    } else {
      await supabase
        .from("organization_page_connections")
        .insert({ follower_page_id: myPageId, following_page_id: page.id });
      setPageFollowing((prev) => ({ ...prev, [myPageId]: true }));
    }
  }

  async function pickPostImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) setPostImageUri(result.assets[0].uri);
  }

  function closePostModal() {
    setShowPostModal(false);
    setPostText("");
    setPostImageUri(null);
    setShowAiPanel(false);
    setAiPrompt("");
    setAiLoading(null);
  }

  async function submitPost() {
    if (!postText.trim() || !page || !user) return;
    setPosting(true);

    let image_url: string | null = null;
    if (postImageUri) {
      setUploadingPostImage(true);
      const ext = postImageUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
      const { publicUrl, error: uploadErr } = await uploadToStorage(
        "org-post-images",
        `${user.id}/${page.id}_${Date.now()}.${ext}`,
        postImageUri,
      );
      setUploadingPostImage(false);
      if (!publicUrl) {
        setPosting(false);
        showAlert("Upload failed", uploadErr || "Could not upload image. Please try again.");
        return;
      }
      image_url = publicUrl;
    }

    const { error } = await supabase.from("organization_page_posts").insert({
      page_id: page.id,
      author_id: user.id,
      content: postText.trim(),
      ...(image_url ? { image_url } : {}),
    });
    setPosting(false);
    if (error) { showAlert("Error", "Could not publish update."); return; }
    const publishedContent = postText.trim();
    setPostText("");
    setPostImageUri(null);
    setShowPostModal(false);
    load();
    notifyFollowers(page, user.id, publishedContent);
  }

  async function notifyFollowers(p: OrgPage, senderId: string, content: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const { data: rows } = await supabase
        .from("organization_page_followers")
        .select("user_id")
        .eq("page_id", p.id)
        .neq("user_id", senderId)
        .limit(100);
      if (!rows || rows.length === 0) return;
      const userIds = rows.map((r: any) => r.user_id);
      const body = content.length > 120 ? content.slice(0, 117) + "…" : content;
      await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          userIds,
          title: p.name,
          body,
          data: { type: "org_update", page_id: p.id, page_slug: p.slug },
        }),
      });
    } catch (_) {}
  }

  async function submitJob() {
    if (!jobForm.title.trim() || !jobForm.description.trim() || !page || !user) return;
    if (jobForm.description.trim().length < 20) { showAlert("Too short", "Job description must be at least 20 characters."); return; }
    setPostingJob(true);
    const { error } = await supabase.from("org_page_jobs").insert({
      page_id: page.id,
      title: jobForm.title.trim(),
      job_type: jobForm.job_type,
      location: jobForm.location.trim() || null,
      description: jobForm.description.trim(),
      apply_url: jobForm.apply_url.trim() || null,
      is_active: true,
    });
    setPostingJob(false);
    if (error) { showAlert("Error", "Could not post job listing."); return; }
    setJobForm({ title: "", job_type: "Full-time", location: "", description: "", apply_url: "" });
    setShowJobModal(false);
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
          <ActivityIndicator color={colors.accent} />
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

  const coverHeight = headerTop + 48 + 140;

  const Header = (
    <View>
      {/* Cover — extends all the way to device top edge behind status bar + nav bar */}
      <View style={[styles.cover, { height: coverHeight, backgroundColor: isDark ? "#1a1a1a" : "#e8f4f8" }]}>
        {page.cover_url ? (
          <Image source={{ uri: page.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="business" size={40} color={isDark ? "#333" : "#cde"} />
          </View>
        )}
        {/* Dark gradient at top so floating nav icons remain legible over any cover */}
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "transparent"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: headerTop + 60 }}
        />
      </View>

      {/* Logo (square) — overlaps bottom of cover */}
      <View style={[styles.logoWrap, { backgroundColor: colors.background }]}>
        <View style={[styles.logo, { borderColor: colors.background }]}>
          {page.logo_url ? (
            <Image source={{ uri: page.logo_url }} style={styles.logoImg} resizeMode="cover" />
          ) : (
            <View style={[styles.logoFallback, { backgroundColor: colors.accent }]}>
              <Text style={styles.logoFallbackText}>{page.name.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Header info card */}
      <View style={[styles.headerCard, { backgroundColor: colors.surface }]}>
        {/* Name + badge */}
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

        {/* Meta chips */}
        <View style={styles.metaRow}>
          {page.industry ? <MetaChip icon="briefcase-outline" text={page.industry} colors={colors} /> : null}
          {page.location ? <MetaChip icon="location-outline" text={page.location} colors={colors} /> : null}
          {page.size ? <MetaChip icon="people-outline" text={page.size} colors={colors} /> : null}
          {page.founded_year ? <MetaChip icon="calendar-outline" text={`Est. ${page.founded_year}`} colors={colors} /> : null}
        </View>

        {/* Followers stat (only) */}
        <TouchableOpacity
          style={styles.statRow}
          onPress={() => setActiveTab("followers")}
          activeOpacity={0.7}
        >
          <Text style={[styles.statValue, { color: colors.accent }]}>{page.followers_count.toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Followers</Text>
        </TouchableOpacity>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {!isAdmin && (
            <TouchableOpacity
              style={[styles.followBtn, {
                backgroundColor: following ? colors.surface : colors.accent,
                borderColor: following ? colors.border : colors.accent,
                borderWidth: 1,
              }]}
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

          {/* Page-to-page follow button (for users who manage other pages) */}
          {!isAdmin && myPages.length > 0 && (
            <TouchableOpacity
              style={[styles.websiteBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowPageFollowModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="business-outline" size={15} color={colors.text} />
              <Text style={[styles.websiteBtnText, { color: colors.text }]}>Follow as Page</Text>
            </TouchableOpacity>
          )}

          {isAdmin && (
            <TouchableOpacity
              style={[styles.followBtn, { backgroundColor: colors.accent }]}
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
              <Ionicons name="globe-outline" size={15} color={colors.text} />
              <Text style={[styles.websiteBtnText, { color: colors.text }]}>Website</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* About — collapsible */}
        {page.description ? (
          <View style={[styles.aboutBox, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={styles.aboutHeader}
              onPress={() => setAboutExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ABOUT</Text>
              <Ionicons
                name={aboutExpanded ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.textMuted}
              />
            </TouchableOpacity>
            {aboutExpanded ? (
              <>
                <Text style={[styles.aboutText, { color: colors.textSecondary }]}>{page.description}</Text>
                <TouchableOpacity onPress={() => setAboutExpanded(false)} activeOpacity={0.7}>
                  <Text style={[styles.aboutToggle, { color: colors.accent }]}>Show less</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={() => setAboutExpanded(true)} activeOpacity={0.7}>
                <Text style={[styles.aboutText, { color: colors.textSecondary }]} numberOfLines={2}>
                  {page.description}
                </Text>
                <Text style={[styles.aboutToggle, { color: colors.accent }]}>Read more</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Contact & location details */}
        {(page.email || page.org_type || page.physical_address || page.registration_number) ? (
          <View style={[styles.detailsBox, { borderTopColor: colors.border }]}>
            {page.org_type && <DetailRow icon="business-outline" text={page.org_type} colors={colors} />}
            {page.registration_number && (
              <DetailRow
                icon="document-text-outline"
                text={`Reg. No. ${page.registration_number}${page.jurisdiction_code ? ` (${page.jurisdiction_code.toUpperCase()})` : ""}`}
                colors={colors}
              />
            )}
            {page.email && (
              <TouchableOpacity
                style={styles.detailRow}
                onPress={() => Linking.openURL(`mailto:${page.email}`)}
                activeOpacity={0.75}
              >
                <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.detailText, { color: colors.accent, textDecorationLine: "underline" }]}>
                  {page.email}
                </Text>
              </TouchableOpacity>
            )}
            {page.physical_address && <DetailRow icon="location-outline" text={page.physical_address} colors={colors} />}
          </View>
        ) : null}
      </View>

      {/* Admin verify banner */}
      {isAdmin && !page.is_verified && !verifyBannerDismissed && (
        <View style={[styles.verifyBanner, { backgroundColor: "#D4A853" + "14", borderColor: "#D4A853" + "40" }]}>
          <View style={styles.verifyBannerIcon}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#D4A853" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.verifyBannerTitle, { color: "#D4A853" }]}>Get your page verified</Text>
            <Text style={[styles.verifyBannerSub, { color: colors.textSecondary }]}>
              The gold badge builds trust and makes your page stand out to followers.
            </Text>
            <TouchableOpacity
              style={[styles.verifyBannerBtn, { backgroundColor: "#D4A853" }]}
              onPress={() => router.push(`/company/manage?slug=${page.slug}` as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
              <Text style={styles.verifyBannerBtnText}>Apply for Verification</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            hitSlop={12}
            onPress={() => setVerifyBannerDismissed(true)}
            style={styles.verifyBannerDismiss}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(["updates", "followers", "jobs"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, { color: activeTab === t ? colors.accent : colors.textMuted }]} numberOfLines={1}>
              {t === "updates" ? `Updates (${posts.length})` : t === "followers" ? `Followers (${page.followers_count})` : `Jobs (${jobs.length})`}
            </Text>
          </TouchableOpacity>
        ))}
        {isAdmin && activeTab === "updates" && (
          <TouchableOpacity
            style={styles.tabAction}
            onPress={() => setShowPostModal(true)}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        )}
        {isAdmin && activeTab === "jobs" && (
          <TouchableOpacity
            style={styles.tabAction}
            onPress={() => setShowJobModal(true)}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Floating transparent NavBar — overlays cover image */}
      <View style={[styles.navBarFloat, { paddingTop: headerTop, pointerEvents: "box-none" } as any]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: "#fff" }]} numberOfLines={1}>{page.name}</Text>
        {isAdmin ? (
          <TouchableOpacity onPress={() => router.push(`/company/manage?slug=${page.slug}` as any)} hitSlop={12}>
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {activeTab === "updates" ? (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <View style={styles.emptyPosts}>
              <Ionicons name="newspaper-outline" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No updates yet.</Text>
              {isAdmin && (
                <TouchableOpacity
                  onPress={() => setShowPostModal(true)}
                  style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Post your first update</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.postHeader}>
                <View style={[styles.postLogo, { backgroundColor: colors.accent }]}>
                  {page.logo_url
                    ? <Image source={{ uri: page.logo_url }} style={{ width: "100%", height: "100%", borderRadius: 4 }} />
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
      ) : activeTab === "followers" ? (
        <FlatList
          data={followers}
          keyExtractor={(item) => item.user_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <View style={styles.emptyPosts}>
              <Ionicons name="people-outline" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No followers yet.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const p = item.profiles;
            if (!p) return null;
            return (
              <TouchableOpacity
                style={[styles.followerRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/${p.handle}` as any)}
                activeOpacity={0.8}
              >
                <View style={styles.followerAvatar}>
                  {p.avatar_url ? (
                    <Image source={{ uri: p.avatar_url }} style={styles.followerAvatarImg} />
                  ) : (
                    <View style={[styles.followerAvatarImg, { backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 }}>
                        {(p.display_name || p.handle || "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={[styles.followerName, { color: colors.text }]} numberOfLines={1}>
                      {p.display_name || p.handle || "User"}
                    </Text>
                    {p.is_verified && (
                      <Ionicons name="checkmark-circle" size={13} color={colors.accent} />
                    )}
                  </View>
                  {p.handle ? (
                    <Text style={[styles.followerHandle, { color: colors.textMuted }]}>@{p.handle}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      ) : (
        /* Jobs Tab — exclusive to company pages */
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<View>{Header}</View>}
          ListEmptyComponent={
            <View style={styles.emptyPosts}>
              <Ionicons name="briefcase-outline" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No open positions yet.</Text>
              {isAdmin && (
                <TouchableOpacity
                  onPress={() => setShowJobModal(true)}
                  style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Post a Job</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: job }) => (
            <View style={[styles.jobCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.jobCardHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.jobTitle, { color: colors.text }]}>{job.title}</Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    <View style={[styles.jobTypeBadge, { backgroundColor: colors.accent + "18" }]}>
                      <Text style={[styles.jobTypeBadgeText, { color: colors.accent }]}>{job.job_type}</Text>
                    </View>
                    {job.location ? (
                      <View style={[styles.jobLocBadge, { backgroundColor: colors.backgroundSecondary ?? colors.background }]}>
                        <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                        <Text style={[styles.jobLocText, { color: colors.textMuted }]}>{job.location}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={[styles.jobDate, { color: colors.textMuted }]}>
                  {new Date(job.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
              </View>
              <Text style={[styles.jobDesc, { color: colors.textSecondary }]} numberOfLines={3}>{job.description}</Text>
              {job.apply_url ? (
                <TouchableOpacity
                  style={[styles.applyBtn, { backgroundColor: colors.accent }]}
                  onPress={() => Linking.openURL(job.apply_url!.startsWith("http") ? job.apply_url! : `https://${job.apply_url}`)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.applyBtnText}>Apply Now</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      )}

      {/* Post update modal */}
      <Modal visible={showPostModal} transparent animationType="slide" onRequestClose={closePostModal}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePostModal}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <ScrollView
                style={[styles.modalSheet, { backgroundColor: colors.surface }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
              >
                <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

                {/* Header row */}
                <View style={styles.postModalHeader}>
                  <TouchableOpacity onPress={closePostModal} hitSlop={8}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>Post an Update</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    {postText.length}/3000
                  </Text>
                </View>

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

                {/* AI loading bar */}
                {aiLoading && (
                  <View style={[styles.aiLoadingBar, { backgroundColor: colors.accent + "12" }]}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.aiLoadingText, { color: colors.accent }]}>
                      {aiLoading === "generate" ? "Writing your update…" : aiLoading === "improve" ? "Improving your draft…" : "Adding hashtags…"}
                    </Text>
                  </View>
                )}

                {/* AI panel toggle */}
                <TouchableOpacity
                  style={[styles.aiToggle, { backgroundColor: colors.accent + "0D", borderColor: colors.accent + "25" }]}
                  onPress={() => setShowAiPanel((v) => !v)}
                  activeOpacity={0.75}
                  disabled={!!aiLoading || posting}
                >
                  <Ionicons name="sparkles" size={15} color={colors.accent} />
                  <Text style={[styles.aiToggleText, { color: colors.accent }]}>AI Writing Assistant</Text>
                  <Ionicons name={showAiPanel ? "chevron-up" : "chevron-down"} size={13} color={colors.accent} />
                </TouchableOpacity>

                {/* AI panel — expanded */}
                {showAiPanel && (
                  <View style={[styles.aiPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>

                    {/* Tone selector */}
                    <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                      {(["professional", "exciting", "informative"] as const).map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.toneChip, {
                            backgroundColor: aiTone === t ? colors.accent : colors.surface,
                            borderColor: aiTone === t ? colors.accent : colors.border,
                          }]}
                          onPress={() => setAiTone(t)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.toneChipText, { color: aiTone === t ? "#fff" : colors.textMuted }]}>
                            {t === "professional" ? "🏢 Pro" : t === "exciting" ? "🚀 Exciting" : "📋 Info"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Generate from scratch */}
                    <View style={[styles.aiGenerateRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <TextInput
                        style={[styles.aiPromptInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                        placeholder="Topic to write about (e.g. new product launch)…"
                        placeholderTextColor={colors.textMuted}
                        value={aiPrompt}
                        onChangeText={setAiPrompt}
                        maxLength={200}
                        returnKeyType="done"
                      />
                      <TouchableOpacity
                        style={[styles.aiGenerateBtn, { backgroundColor: colors.accent, opacity: !aiPrompt.trim() || !!aiLoading ? 0.5 : 1 }]}
                        disabled={!aiPrompt.trim() || !!aiLoading}
                        activeOpacity={0.8}
                        onPress={async () => {
                          if (!page || !aiPrompt.trim()) return;
                          setAiLoading("generate");
                          try {
                            const result = await aiGenerateOrgUpdate(
                              { name: page.name, industry: page.industry ?? undefined, tagline: page.tagline ?? undefined, orgType: page.org_type ?? undefined, location: page.location ?? undefined, website: page.website ?? undefined, foundedYear: page.founded_year ? String(page.founded_year) : undefined },
                              aiPrompt.trim(),
                              aiTone
                            );
                            setPostText(result.slice(0, 3000));
                          } catch { showAlert("AI Error", "Could not generate update. Please try again."); }
                          setAiLoading(null);
                        }}
                      >
                        <Ionicons name="sparkles" size={14} color="#fff" />
                        <Text style={styles.aiGenerateBtnText}>Generate</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Improve draft + hashtags row */}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[styles.aiActionBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: !postText.trim() || !!aiLoading ? 0.45 : 1 }]}
                        disabled={!postText.trim() || !!aiLoading}
                        activeOpacity={0.75}
                        onPress={async () => {
                          if (!postText.trim() || !page) return;
                          setAiLoading("improve");
                          try {
                            const result = await aiEnhanceOrgPost(
                              postText,
                              { name: page.name, industry: page.industry ?? undefined, tagline: page.tagline ?? undefined, orgType: page.org_type ?? undefined }
                            );
                            setPostText(result.slice(0, 3000));
                          } catch { showAlert("AI Error", "Could not improve your draft. Try again."); }
                          setAiLoading(null);
                        }}
                      >
                        <Ionicons name="color-wand-outline" size={15} color="#6366F1" />
                        <Text style={[styles.aiActionBtnText, { color: colors.text }]}>Improve draft</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.aiActionBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: !postText.trim() || !!aiLoading ? 0.45 : 1 }]}
                        disabled={!postText.trim() || !!aiLoading}
                        activeOpacity={0.75}
                        onPress={async () => {
                          if (!postText.trim()) return;
                          setAiLoading("hashtags");
                          try {
                            const tags = await aiGenerateHashtags(postText);
                            if (tags.length > 0) {
                              setPostText((prev) => (prev.trim() + "\n" + tags.join(" ")).slice(0, 3000));
                            }
                          } catch { showAlert("AI Error", "Could not generate hashtags. Try again."); }
                          setAiLoading(null);
                        }}
                      >
                        <Ionicons name="pricetag-outline" size={15} color="#F59E0B" />
                        <Text style={[styles.aiActionBtnText, { color: colors.text }]}>Add hashtags</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Attached image preview */}
                {postImageUri ? (
                  <View style={styles.postImageWrap}>
                    <Image source={{ uri: postImageUri }} style={styles.postImagePreview} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.postImageRemove}
                      onPress={() => setPostImageUri(null)}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={24} color="#fff" />
                    </TouchableOpacity>
                    {uploadingPostImage && (
                      <View style={styles.postImageUploadingOverlay}>
                        <ActivityIndicator color="#fff" />
                      </View>
                    )}
                  </View>
                ) : null}

                {/* Toolbar + publish */}
                <View style={styles.postModalFooter}>
                  <TouchableOpacity
                    style={[styles.attachBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={pickPostImage}
                    activeOpacity={0.7}
                    disabled={posting}
                  >
                    <Ionicons name="image-outline" size={20} color={colors.accent} />
                    <Text style={[styles.attachBtnText, { color: colors.accent }]}>Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: colors.accent, opacity: posting || !postText.trim() ? 0.6 : 1, flex: 1 }]}
                    onPress={submitPost}
                    disabled={posting || !postText.trim()}
                    activeOpacity={0.85}
                  >
                    {posting
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.submitBtnText}>Publish</Text>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Post Job modal — exclusive to company page admins */}
      <Modal visible={showJobModal} transparent animationType="slide" onRequestClose={() => setShowJobModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowJobModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <Pressable>
            <ScrollView style={[styles.modalSheet, { backgroundColor: colors.surface }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>Post a Job</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>{page.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowJobModal(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.postInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, minHeight: 44 }]}
                placeholder="Job title (e.g. Senior Software Engineer)"
                placeholderTextColor={colors.textMuted}
                value={jobForm.title}
                onChangeText={(v) => setJobForm((f) => ({ ...f, title: v }))}
                maxLength={120}
              />

              {/* Job type chips */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {["Full-time","Part-time","Contract","Internship","Volunteer","Remote"].map((jt) => (
                  <TouchableOpacity
                    key={jt}
                    style={[styles.jobTypeChip, { backgroundColor: jobForm.job_type === jt ? colors.accent : colors.background, borderColor: jobForm.job_type === jt ? colors.accent : colors.border }]}
                    onPress={() => setJobForm((f) => ({ ...f, job_type: jt }))}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: jobForm.job_type === jt ? "#fff" : colors.text }}>{jt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.postInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, minHeight: 44 }]}
                placeholder="Location (e.g. Nairobi, Kenya or Remote)"
                placeholderTextColor={colors.textMuted}
                value={jobForm.location}
                onChangeText={(v) => setJobForm((f) => ({ ...f, location: v }))}
                maxLength={100}
              />

              {/* AI Generate button */}
              <TouchableOpacity
                style={[styles.aiToggle, { backgroundColor: colors.accent + "0D", borderColor: colors.accent + "30" }]}
                activeOpacity={0.75}
                disabled={!jobForm.title.trim() || jobAiLoading}
                onPress={async () => {
                  if (!page || !jobForm.title.trim()) return;
                  setJobAiLoading(true);
                  try {
                    const desc = await aiGenerateJobDescription(
                      jobForm.title.trim(),
                      jobForm.job_type,
                      jobForm.location.trim(),
                      {
                        orgName: page.name,
                        orgType: page.org_type ?? undefined,
                        industry: page.industry ?? undefined,
                        location: page.location ?? undefined,
                        website: page.website ?? undefined,
                        description: page.description ?? undefined,
                        tagline: page.tagline ?? undefined,
                      }
                    );
                    setJobForm((f) => ({ ...f, description: desc.slice(0, 3000) }));
                  } catch {
                    showAlert("AI Error", "Could not generate job description. Please try again.");
                  }
                  setJobAiLoading(false);
                }}
              >
                {jobAiLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="sparkles" size={15} color={colors.accent} />
                )}
                <Text style={[styles.aiToggleText, { color: colors.accent }]}>
                  {jobAiLoading ? "Researching company & writing description…" : !jobForm.title.trim() ? "Enter a job title to use AI" : "Generate description with AI"}
                </Text>
                {!jobAiLoading && <Ionicons name="arrow-forward" size={13} color={colors.accent} />}
              </TouchableOpacity>

              {/* AI info banner */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 16 }}>
                  AI analyses {page.name}'s industry, org type, and company info to generate a tailored, accurate job description. Review and edit before posting.
                </Text>
              </View>

              <TextInput
                style={[styles.postInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, minHeight: 140, textAlignVertical: "top" }]}
                placeholder="Job description — responsibilities, requirements, benefits…"
                placeholderTextColor={colors.textMuted}
                value={jobForm.description}
                onChangeText={(v) => setJobForm((f) => ({ ...f, description: v }))}
                multiline
                numberOfLines={6}
                maxLength={3000}
              />

              <TextInput
                style={[styles.postInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, minHeight: 44 }]}
                placeholder="Application URL (optional)"
                placeholderTextColor={colors.textMuted}
                value={jobForm.apply_url}
                onChangeText={(v) => setJobForm((f) => ({ ...f, apply_url: v }))}
                autoCapitalize="none"
                keyboardType="url"
                maxLength={300}
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.accent, opacity: postingJob || !jobForm.title.trim() || !jobForm.description.trim() ? 0.6 : 1, marginBottom: 20 }]}
                onPress={submitJob}
                disabled={postingJob || !jobForm.title.trim() || !jobForm.description.trim()}
                activeOpacity={0.85}
              >
                {postingJob
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitBtnText}>Post Job Listing</Text>
                }
              </TouchableOpacity>
            </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Page-to-page follow modal */}
      <Modal visible={showPageFollowModal} transparent animationType="slide" onRequestClose={() => setShowPageFollowModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPageFollowModal(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Follow as a Page</Text>
            <Text style={[{ color: colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 }]}>
              Choose which of your pages will follow {page.name}:
            </Text>
            {myPages.map((mp) => {
              const isFollowing = pageFollowing[mp.id];
              return (
                <TouchableOpacity
                  key={mp.id}
                  style={[styles.pageFollowRow, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => togglePageFollow(mp.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.pageFollowLogo, { backgroundColor: colors.accent }]}>
                    {mp.logo_url
                      ? <Image source={{ uri: mp.logo_url }} style={{ width: "100%", height: "100%", borderRadius: 4 }} />
                      : <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 }}>{mp.name.slice(0, 1)}</Text>
                    }
                  </View>
                  <Text style={[{ flex: 1, color: colors.text, fontFamily: "Inter_500Medium", fontSize: 15 }]} numberOfLines={1}>
                    {mp.name}
                  </Text>
                  <View style={[styles.pageFollowChip, { backgroundColor: isFollowing ? colors.accent : colors.surface, borderColor: isFollowing ? colors.accent : colors.border }]}>
                    <Ionicons name={isFollowing ? "checkmark" : "add"} size={14} color={isFollowing ? "#fff" : colors.text} />
                    <Text style={[{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: isFollowing ? "#fff" : colors.text }]}>
                      {isFollowing ? "Following" : "Follow"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function MetaChip({ icon, text, colors }: { icon: any; text: string; colors: any }) {
  return (
    <View style={[styles.metaChip, { backgroundColor: colors.backgroundSecondary ?? colors.surface }]}>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navBarFloat: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  cover: { width: "100%" },

  logoWrap: { paddingHorizontal: 16, marginTop: -44 },
  logo: { width: 88, height: 88, borderRadius: 6, borderWidth: 3, overflow: "hidden" },
  logoImg: { width: "100%", height: "100%", borderRadius: 4 },
  logoFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: "#fff", fontSize: 34, fontFamily: "Inter_700Bold" },

  headerCard: { padding: 16, gap: 10, marginTop: 8 },
  pageName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  metaChipText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  verifiedText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  followBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  websiteBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  websiteBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  aboutBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 6 },
  aboutHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  aboutText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  aboutToggle: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  detailsBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  tabs: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabAction: { paddingHorizontal: 14, paddingVertical: 10 },

  postCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postLogo: { width: 36, height: 36, borderRadius: 4, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  postPageName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  postDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  postImage: { width: "100%", height: 200, borderRadius: 10, marginTop: 4 },

  followerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginTop: 8, borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  followerAvatar: { width: 46, height: 46, borderRadius: 23, overflow: "hidden" },
  followerAvatarImg: { width: 46, height: 46, borderRadius: 23 },
  followerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  followerHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },

  emptyPosts: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  emptyBtn: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },

  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  postModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  postInput: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 120, textAlignVertical: "top" },
  postImageWrap: { position: "relative", borderRadius: 12, overflow: "hidden" },
  postImagePreview: { width: "100%", height: 180, borderRadius: 12 },
  postImageRemove: { position: "absolute", top: 8, right: 8 },
  postImageUploadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", borderRadius: 12 },
  postModalFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  attachBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  attachBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  submitBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  pageFollowRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  pageFollowLogo: { width: 38, height: 38, borderRadius: 4, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pageFollowChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },

  aiLoadingBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  aiLoadingText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  aiToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  aiToggleText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  aiPanel: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 0 },
  toneChip: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  toneChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  aiGenerateRow: { gap: 8 },
  aiPromptInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  aiGenerateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  aiGenerateBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  aiActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  aiActionBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  verifyBanner: { marginHorizontal: 12, marginTop: 8, borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  verifyBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#D4A85318", alignItems: "center", justifyContent: "center", marginTop: 2 },
  verifyBannerTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  verifyBannerSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  verifyBannerBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginTop: 8 },
  verifyBannerBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  verifyBannerDismiss: { padding: 2, marginTop: -2 },

  jobCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  jobCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  jobTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  jobTypeBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  jobTypeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  jobLocBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  jobLocText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  jobDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  jobDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  applyBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  jobTypeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
});
