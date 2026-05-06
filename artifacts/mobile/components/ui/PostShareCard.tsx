import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

export type ShareablePost = {
  id: string;
  author_name: string;
  author_handle: string;
  avatar_url: string | null;
  is_verified?: boolean;
  is_org_verified?: boolean;
  created_at: string;
  post_type: string;
  content: string;
  article_title?: string | null;
  like_count: number;
  reply_count: number;
  view_count: number;
  bookmarked?: boolean;
  accent?: string;
};

const DEFAULT_ACCENT = "#00BCD4";

function fmtRel(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function fmtNum(n: number): string {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

interface ShareCardProps {
  post: ShareablePost;
  avatarSrc: string | null;
}

export const ShareCard = React.forwardRef<View, ShareCardProps>(function ShareCard(
  { post, avatarSrc },
  ref,
) {
  const accent = post.accent || DEFAULT_ACCENT;
  const isVerif = post.is_verified || post.is_org_verified;
  const badgeColor = post.is_org_verified ? "#D4A853" : accent;
  const wordCount = (post.article_title ? post.article_title + " " : "") + post.content;
  const readTime = post.article_title
    ? Math.max(1, Math.round(wordCount.trim().split(/\s+/).filter(Boolean).length / 200))
    : null;
  const excerpt =
    post.content.length > 220 ? post.content.slice(0, 218).trimEnd() + "…" : post.content;

  return (
    <View
      ref={ref}
      style={s.card}
      collapsable={false}
      {...(Platform.OS === "web" ? ({ "data-afu-share-card": "1" } as any) : {})}
    >
      {/* ── Accent top bar ── */}
      <View style={[s.topBar, { backgroundColor: accent }]} />

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.avatarBox}>
          {avatarSrc ? (
            <Image
              source={{ uri: avatarSrc }}
              style={{ width: 46, height: 46, borderRadius: 23 }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[s.avatarFallback, { backgroundColor: accent + "28" }]}>
              <Text style={[s.avatarLetter, { color: accent }]}>
                {(post.author_name || "U").slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={s.authorName} numberOfLines={1}>
              {post.author_name}
            </Text>
            {isVerif && <Ionicons name="checkmark-circle" size={15} color={badgeColor} />}
          </View>
          <Text style={s.authorSub} numberOfLines={1}>
            @{post.author_handle} · {fmtRel(post.created_at)}
          </Text>
        </View>
      </View>

      {/* ── Type badge ── */}
      {(post.post_type === "article" || post.post_type === "video") && (
        <View style={s.badgeRow}>
          <View style={[s.badge, { backgroundColor: accent + "16" }]}>
            <Ionicons
              name={post.post_type === "video" ? "videocam" : "document-text"}
              size={11}
              color={accent}
            />
            <Text style={[s.badgeText, { color: accent }]}>
              {post.post_type === "article" ? "Article" : "Video"}
            </Text>
            {readTime && <Text style={s.readTime}>{readTime} min read</Text>}
          </View>
        </View>
      )}

      {/* ── Article title ── */}
      {post.article_title ? <Text style={s.title}>{post.article_title}</Text> : null}

      {/* ── Content / excerpt ── */}
      {excerpt.trim().length > 0 && (
        <Text style={s.excerpt} numberOfLines={post.post_type === "article" ? 3 : 8}>
          {excerpt}
        </Text>
      )}

      {/* ── CTA button ── */}
      {(post.post_type === "article" || post.post_type === "video") && (
        <View style={[s.ctaBtn, { backgroundColor: accent }]}>
          <Ionicons
            name={post.post_type === "video" ? "play-circle-outline" : "book-outline"}
            size={14}
            color="#fff"
          />
          <Text style={s.ctaText}>
            {post.post_type === "video" ? "Watch video" : "Read article"}
          </Text>
        </View>
      )}

      {/* ── Divider ── */}
      <View style={s.divider} />

      {/* ── Stats row ── */}
      <View style={s.statsRow}>
        <View style={s.stat}>
          <Ionicons name="heart-outline" size={15} color="#9CA3AF" />
          <Text style={s.statNum}>{fmtNum(post.like_count)}</Text>
        </View>
        <View style={s.stat}>
          <Ionicons name="chatbubble-outline" size={14} color="#9CA3AF" />
          <Text style={s.statNum}>{fmtNum(post.reply_count)}</Text>
        </View>
        <View style={s.stat}>
          <Ionicons name="arrow-redo-outline" size={15} color="#9CA3AF" />
          <Text style={s.statNum}>Share</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={s.stat}>
          <Ionicons name="eye-outline" size={14} color="#9CA3AF" />
          <Text style={s.statNum}>{fmtNum(post.view_count)}</Text>
        </View>
        <Ionicons
          name={post.bookmarked ? "bookmark" : "bookmark-outline"}
          size={15}
          color="#9CA3AF"
        />
      </View>

      {/* ── Branding bar ── */}
      <View style={[s.brandBar, { backgroundColor: accent }]}>
        <Ionicons name="chatbubble-ellipses" size={14} color="#fff" />
        <Text style={s.brandText}>AfuChat · afuchat.com</Text>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  card: {
    width: 390,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
  topBar: { height: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 13,
  },
  avatarBox: { width: 46, height: 46, borderRadius: 23, overflow: "hidden", flexShrink: 0 },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 19, fontWeight: "700" },
  authorName: { fontSize: 15, fontWeight: "700", color: "#111827", maxWidth: 200 },
  authorSub: { fontSize: 12, color: "#6B7280" },
  badgeRow: { paddingHorizontal: 18, paddingBottom: 10 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  readTime: { fontSize: 11, color: "#9CA3AF", marginLeft: 2 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 27,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  excerpt: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 18,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 16,
  },
  stat: { flexDirection: "row", alignItems: "center", gap: 5 },
  statNum: { fontSize: 13, color: "#9CA3AF" },
  brandBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
  },
  brandText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});

export function PostShareCaptureModal({
  post,
  visible,
  onClose,
}: {
  post: ShareablePost | null;
  visible: boolean;
  onClose: () => void;
}) {
  const cardRef = useRef<View>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !post) {
      setAvatarSrc(null);
      return;
    }
    if (Platform.OS === "web" && post.avatar_url) {
      fetch(post.avatar_url)
        .then((r) => r.blob())
        .then(
          (blob) =>
            new Promise<string>((res, rej) => {
              const reader = new FileReader();
              reader.onloadend = () => res(reader.result as string);
              reader.onerror = rej;
              reader.readAsDataURL(blob);
            }),
        )
        .then(setAvatarSrc)
        .catch(() => setAvatarSrc(post.avatar_url));
    } else {
      setAvatarSrc(post.avatar_url);
    }
  }, [visible, post?.avatar_url]);

  async function handleSave() {
    if (!post) return;
    setSaving(true);
    try {
      if (Platform.OS === "web") {
        if (typeof document === "undefined") throw new Error("no document");
        const html2canvas = (await import("html2canvas")).default;
        const el = document.querySelector("[data-afu-share-card]") as HTMLElement | null;
        if (!el) throw new Error("share card not found");
        const canvas = await html2canvas(el, {
          useCORS: false,
          allowTaint: false,
          backgroundColor: "#ffffff",
          scale: 3,
          logging: false,
          imageTimeout: 8000,
        });
        const dataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `afuchat-${post.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        let captureRef: any;
        try {
          captureRef = require("react-native-view-shot").captureRef;
        } catch {
          throw new Error("view-shot not available");
        }
        const uri = await captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
        const Sharing = require("expo-sharing");
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: "image/png",
            dialogTitle: "Share AfuChat Post",
          });
        }
      }
    } catch (_err) {
      Alert.alert(
        "Save failed",
        "Could not save the post image. If the issue persists, check the Status page under Settings.",
        [{ text: "OK" }],
      );
    }
    setSaving(false);
    onClose();
  }

  if (!post) return null;
  const accent = post.accent || DEFAULT_ACCENT;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={m.backdrop}>
        <View style={m.sheet}>
          {/* Handle */}
          <View style={m.handle} />

          <Text style={m.previewTitle}>Share as Image</Text>
          <Text style={m.previewSub}>Your post formatted as a beautiful share card</Text>

          {/* Card preview */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={m.cardScroll}
            style={{ flexGrow: 0 }}
          >
            <ShareCard ref={cardRef} post={post} avatarSrc={avatarSrc} />
          </ScrollView>

          {/* Actions */}
          <View style={m.actions}>
            <TouchableOpacity
              style={[m.saveBtn, { backgroundColor: accent }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={Platform.OS === "web" ? "download-outline" : "share-outline"}
                    size={19}
                    color="#fff"
                  />
                  <Text style={m.saveBtnText}>
                    {Platform.OS === "web" ? "Download Image" : "Save & Share"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={m.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 24,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 18,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  previewSub: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 6,
  },
  cardScroll: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  actions: {
    paddingHorizontal: 20,
    gap: 10,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: { alignItems: "center", paddingVertical: 13 },
  cancelText: { fontSize: 16, color: "#6B7280", fontWeight: "500" },
});
