import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useOpenLink } from "@/lib/useOpenLink";

// ─── Types ───────────────────────────────────────────────────────────────────

type ProfileCard = {
  kind: "profile";
  handle: string;
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  followers_count: number;
};

type UrlCard = {
  kind: "url";
  url: string;
  title: string;
  hostname: string;
};

type PreviewData = ProfileCard | UrlCard | null;

// ─── Regex helpers ────────────────────────────────────────────────────────────

const AFUCHAT_HANDLE_URL = /https?:\/\/(?:afuchat\.app|afuchat\.com|www\.afuchat\.app|www\.afuchat\.com)\/@([\w]{1,30})/i;
const BARE_MENTION = /^@([\w]{1,30})$/;
const PLAIN_URL = /https?:\/\/[^\s<)]{5,}/i;

/**
 * Extract the first "interesting" segment from a message:
 * - An afuchat profile URL  →  render a profile card
 * - A lone @mention (the entire trimmed message is a @handle)  →  profile card
 * - Any other http(s) URL  →  url card
 */
function extractPreviewTarget(
  text: string
): { type: "profile"; handle: string } | { type: "url"; url: string } | null {
  if (!text) return null;

  // 1. afuchat.com/@handle URL anywhere in text
  const afuMatch = AFUCHAT_HANDLE_URL.exec(text);
  if (afuMatch) return { type: "profile", handle: afuMatch[1] };

  // 2. Entire message is a bare @mention
  const bareMatch = BARE_MENTION.exec(text.trim());
  if (bareMatch) return { type: "profile", handle: bareMatch[1] };

  // 3. Any plain URL
  const urlMatch = PLAIN_URL.exec(text);
  if (urlMatch) return { type: "url", url: urlMatch[0] };

  return null;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const profileCache: Record<string, ProfileCard | "miss"> = {};
const urlCache: Record<string, UrlCard> = {};

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function ProfilePreviewCard({
  card,
  isMe,
  accent,
}: {
  card: ProfileCard;
  isMe: boolean;
  accent: string;
}) {
  const { colors } = useTheme();

  function handlePress() {
    router.push({ pathname: "/contact/[id]", params: { id: card.id } });
  }

  const bg = isMe ? "rgba(255,255,255,0.12)" : colors.backgroundSecondary;
  const borderColor = isMe ? "rgba(255,255,255,0.2)" : colors.border;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={[st.card, { backgroundColor: bg, borderColor }]}
    >
      <View style={st.profileRow}>
        {card.avatar_url ? (
          <Image source={{ uri: card.avatar_url }} style={st.avatar} />
        ) : (
          <View style={[st.avatarPlaceholder, { backgroundColor: accent + "30" }]}>
            <Ionicons name="person" size={18} color={accent} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text
              style={[st.profileName, { color: isMe ? "#fff" : colors.text }]}
              numberOfLines={1}
            >
              {card.display_name}
            </Text>
            {(card.is_verified || card.is_organization_verified) && (
              <Ionicons name="checkmark-circle" size={13} color={accent} />
            )}
          </View>
          <Text style={[st.profileHandle, { color: isMe ? "rgba(255,255,255,0.65)" : colors.textMuted }]}>
            @{card.handle}
          </Text>
          {card.followers_count > 0 && (
            <Text style={[st.profileMeta, { color: isMe ? "rgba(255,255,255,0.55)" : colors.textMuted }]}>
              {card.followers_count.toLocaleString()} followers
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={14} color={isMe ? "rgba(255,255,255,0.5)" : colors.textMuted} />
      </View>
      {card.bio ? (
        <Text
          style={[st.profileBio, { color: isMe ? "rgba(255,255,255,0.7)" : colors.textSecondary }]}
          numberOfLines={2}
        >
          {card.bio}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function UrlPreviewCard({
  card,
  isMe,
  accent,
}: {
  card: UrlCard;
  isMe: boolean;
  accent: string;
}) {
  const { colors } = useTheme();
  const openLink = useOpenLink();

  function handlePress() {
    openLink(card.url);
  }

  const bg = isMe ? "rgba(255,255,255,0.12)" : colors.backgroundSecondary;
  const borderColor = isMe ? "rgba(255,255,255,0.2)" : colors.border;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={[st.card, { backgroundColor: bg, borderColor }]}
    >
      <View style={st.urlRow}>
        <View style={[st.urlIconBg, { backgroundColor: accent + "20" }]}>
          <Ionicons name="link" size={14} color={accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[st.urlTitle, { color: isMe ? "#fff" : colors.text }]}
            numberOfLines={2}
          >
            {card.title}
          </Text>
          <Text
            style={[st.urlHost, { color: isMe ? "rgba(255,255,255,0.55)" : colors.textMuted }]}
            numberOfLines={1}
          >
            {card.hostname}
          </Text>
        </View>
        <Ionicons name="open-outline" size={13} color={isMe ? "rgba(255,255,255,0.5)" : colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LinkPreview({
  text,
  isMe,
}: {
  text: string;
  isMe: boolean;
}) {
  const { colors } = useTheme();
  const accent = colors.accent;
  const [preview, setPreview] = useState<PreviewData>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const target = extractPreviewTarget(text);
    if (!target) { setPreview(null); return; }

    if (target.type === "profile") {
      const cacheKey = target.handle.toLowerCase();
      if (profileCache[cacheKey]) {
        if (profileCache[cacheKey] !== "miss") {
          setPreview(profileCache[cacheKey] as ProfileCard);
        }
        return;
      }
      setLoading(true);
      supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified")
        .eq("handle", target.handle)
        .maybeSingle()
        .then(async ({ data }) => {
          if (!mounted.current) return;
          if (!data) {
            profileCache[cacheKey] = "miss";
            setLoading(false);
            return;
          }
          const { count } = await supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("following_id", data.id);
          const card: ProfileCard = {
            kind: "profile",
            handle: data.handle,
            id: data.id,
            display_name: data.display_name,
            avatar_url: data.avatar_url,
            bio: data.bio ?? null,
            is_verified: data.is_verified ?? false,
            is_organization_verified: data.is_organization_verified ?? false,
            followers_count: count ?? 0,
          };
          profileCache[cacheKey] = card;
          if (mounted.current) { setPreview(card); setLoading(false); }
        })
        // @ts-ignore
        .catch(() => { if (mounted.current) setLoading(false); });
    } else {
      const cacheKey = target.url;
      if (urlCache[cacheKey]) {
        setPreview(urlCache[cacheKey]);
        return;
      }
      let hostname = "";
      try { hostname = new URL(target.url).hostname; } catch { hostname = target.url; }
      const title = hostname.replace(/^www\./, "");
      const card: UrlCard = { kind: "url", url: target.url, title: decodeURIComponent(target.url.split("?")[0].slice(-60)), hostname };
      urlCache[cacheKey] = card;
      setPreview(card);
    }
  }, [text]);

  if (loading) {
    return (
      <View style={st.loadingWrap}>
        <ActivityIndicator size={12} color={isMe ? "rgba(255,255,255,0.5)" : colors.textMuted} />
      </View>
    );
  }

  if (!preview) return null;

  if (preview.kind === "profile") {
    return <ProfilePreviewCard card={preview} isMe={isMe} accent={accent} />;
  }

  return <UrlPreviewCard card={preview} isMe={isMe} accent={accent} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  card: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    padding: 10,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  profileHandle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  profileMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  profileBio: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 7,
    lineHeight: 17,
  },
  urlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  urlIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  urlTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  urlHost: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  loadingWrap: {
    marginTop: 6,
    paddingVertical: 4,
    alignItems: "flex-start",
  },
});
