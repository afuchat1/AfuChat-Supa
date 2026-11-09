/**
 * LinkPreview — rich preview cards for URLs and @mentions in chat bubbles.
 *
 * URL cards fetch:
 *   1. og:image / twitter:image  — displayed as a left-side thumbnail
 *   2. og:title / twitter:title  — displayed as the card title
 *   3. favicon                   — shown when no og:image is available
 *      (Google's reliable favicon CDN: /s2/favicons?domain=…&sz=64)
 *
 * All results are module-level cached so the same URL is only ever fetched once
 * per app session.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
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
  ogImage: string | null;
  favicon: string | null;
};

type PreviewData = ProfileCard | UrlCard | null;

// ─── Regex helpers ────────────────────────────────────────────────────────────

const AFUCHAT_HANDLE_URL =
  /https?:\/\/(?:afuchat\.app|afuchat\.com|www\.afuchat\.app|www\.afuchat\.com)\/@([\w]{1,30})/i;
const BARE_MENTION = /^@([\w]{1,30})$/;
const PLAIN_URL = /https?:\/\/[^\s<)]{5,}/i;

function extractPreviewTarget(
  text: string
): { type: "profile"; handle: string } | { type: "url"; url: string } | null {
  if (!text) return null;
  const afuMatch = AFUCHAT_HANDLE_URL.exec(text);
  if (afuMatch) return { type: "profile", handle: afuMatch[1] };
  const bareMatch = BARE_MENTION.exec(text.trim());
  if (bareMatch) return { type: "profile", handle: bareMatch[1] };
  const urlMatch = PLAIN_URL.exec(text);
  if (urlMatch) return { type: "url", url: urlMatch[0] };
  return null;
}

// ─── OG + favicon fetcher ────────────────────────────────────────────────────

type OgData = { title: string | null; image: string | null };
const _ogCache: Record<string, OgData> = {};

async function fetchOgData(url: string): Promise<OgData> {
  if (url in _ogCache) return _ogCache[url];
  const empty: OgData = { title: null, image: null };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AfuChatBot/1.0)" },
    });
    const html = await res.text();

    // ── og:image / twitter:image ──────────────────────────────────────────
    const imgMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    let image = imgMatch ? imgMatch[1] : null;
    if (image && !image.startsWith("http")) {
      try {
        const base = new URL(res.url);
        image = new URL(image, base.origin).href;
      } catch {}
    }

    // ── og:title / twitter:title / <title> ───────────────────────────────
    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']/i) ||
      html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);

    const title = titleMatch ? titleMatch[1].trim() : null;

    const data: OgData = { title, image };
    _ogCache[url] = data;
    return data;
  } catch {
    _ogCache[url] = empty;
    return empty;
  }
}

/** Google's favicon CDN — returns the site's actual favicon at the requested size. */
function faviconUrl(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
}

// ─── Profile & URL caches ─────────────────────────────────────────────────────

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

  const bg = isMe ? "rgba(255,255,255,0.12)" : colors.backgroundSecondary;
  const borderColor = isMe ? "rgba(255,255,255,0.2)" : colors.border;

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: "/contact/[id]", params: { id: card.id } })}
      activeOpacity={0.8}
      style={[st.card, { backgroundColor: bg, borderColor }]}
    >
      <View style={st.profileRow}>
        {card.avatar_url ? (
          <ExpoImage
            source={{ uri: card.avatar_url }}
            style={st.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
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
          <Text
            style={[st.profileHandle, { color: isMe ? "rgba(255,255,255,0.65)" : colors.textMuted }]}
          >
            @{card.handle}
          </Text>
          {card.followers_count > 0 && (
            <Text
              style={[st.profileMeta, { color: isMe ? "rgba(255,255,255,0.55)" : colors.textMuted }]}
            >
              {card.followers_count.toLocaleString()} followers
            </Text>
          )}
        </View>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={isMe ? "rgba(255,255,255,0.5)" : colors.textMuted}
        />
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

  // Fetch og data (image + title) after initial render so card builds fast
  const [ogImage, setOgImage] = useState<string | null>(card.ogImage);
  const [ogTitle, setOgTitle] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (card.ogImage !== undefined) {
      setOgImage(card.ogImage);
    }
    fetchOgData(card.url).then((data) => {
      if (!mounted.current) return;
      if (data.image) setOgImage(data.image);
      if (data.title) setOgTitle(data.title);
    });
  }, [card.url]);

  const bg = isMe ? "rgba(255,255,255,0.12)" : colors.backgroundSecondary;
  const borderColor = isMe ? "rgba(255,255,255,0.2)" : colors.border;
  const textColor = isMe ? "#fff" : colors.text;
  const mutedColor = isMe ? "rgba(255,255,255,0.55)" : colors.textMuted;
  const displayTitle = ogTitle || card.title;

  return (
    <TouchableOpacity
      onPress={() => openLink(card.url)}
      activeOpacity={0.8}
      style={[st.card, st.urlCard, { backgroundColor: bg, borderColor }]}
    >
      {/* ── Thumbnail: og:image or favicon ── */}
      <View style={st.thumbWrap}>
        {ogImage ? (
          <ExpoImage
            source={{ uri: ogImage }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          /* favicon via Google CDN — always returns a 16×16+ icon */
          <ExpoImage
            source={{ uri: faviconUrl(card.hostname) }}
            style={st.faviconImg}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        )}
      </View>

      {/* ── Text content ── */}
      <View style={st.urlBody}>
        {/* favicon + hostname row */}
        <View style={st.hostRow}>
          <ExpoImage
            source={{ uri: faviconUrl(card.hostname) }}
            style={st.faviconInline}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
          <Text style={[st.urlHost, { color: mutedColor }]} numberOfLines={1}>
            {card.hostname}
          </Text>
        </View>

        {/* title */}
        <Text style={[st.urlTitle, { color: textColor }]} numberOfLines={2}>
          {displayTitle}
        </Text>
      </View>

      <Ionicons
        name="open"
        size={13}
        color={mutedColor}
        style={st.openIcon}
      />
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
      // Build a skeleton card instantly so the bubble doesn't jump
      let hostname = "";
      try { hostname = new URL(target.url).hostname.replace(/^www\./, ""); } catch { hostname = target.url; }
      const cacheKey = target.url;

      if (urlCache[cacheKey]) {
        setPreview(urlCache[cacheKey]);
        return;
      }

      const skeleton: UrlCard = {
        kind: "url",
        url: target.url,
        title: hostname,
        hostname,
        ogImage: null,
        favicon: faviconUrl(hostname),
      };
      setPreview(skeleton);

      // Hydrate with real og data in background
      fetchOgData(target.url).then((data) => {
        if (!mounted.current) return;
        const full: UrlCard = {
          ...skeleton,
          title: data.title || hostname,
          ogImage: data.image,
        };
        urlCache[cacheKey] = full;
        if (mounted.current) setPreview(full);
      });
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

const THUMB_SIZE = 72;

const st = StyleSheet.create({
  card: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  urlCard: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: THUMB_SIZE,
  },

  // ── Thumbnail ──────────────────────────────────────────────────────────────
  thumbWrap: {
    width: THUMB_SIZE,
    minHeight: THUMB_SIZE,
    backgroundColor: "rgba(128,128,128,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  faviconImg: {
    width: 32,
    height: 32,
  },

  // ── Text body ──────────────────────────────────────────────────────────────
  urlBody: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
    justifyContent: "center",
  },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  faviconInline: {
    width: 14,
    height: 14,
    borderRadius: 2,
  },
  urlHost: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  urlTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  openIcon: {
    alignSelf: "center",
    marginRight: 10,
  },

  // ── Profile card ───────────────────────────────────────────────────────────
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
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
    marginTop: 4,
    lineHeight: 17,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },

  // ── Loading ────────────────────────────────────────────────────────────────
  loadingWrap: {
    marginTop: 6,
    paddingVertical: 4,
    alignItems: "flex-start",
  },
});
