/**
 * RichText — inline-formatted text renderer.
 *
 * Supported markdown-style markers:
 *   **text**   → Bold
 *   _text_     → Italic   (only at word boundaries — won't match snake_case)
 *   `text`     → Mono / code
 *   ~~text~~   → Strikethrough
 *   __text__   → Underline (only at word boundaries)
 *   ||text||   → Spoiler (hidden; tap to reveal)
 *
 * Also renders URLs, @mentions, and #hashtags as tappable links.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Image as RNImage, Linking, Platform, StyleSheet, Text } from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { router } from "expo-router";
import { useAppAccent } from "@/context/AppAccentContext";
import { useOpenLink, useOpenLinkActions } from "@/lib/useOpenLink";
import { useAuth } from "@/context/AuthContext";
import { navigateToProfile } from "@/lib/navigateToProfile";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type SpanType =
  | "text"
  | "bold"
  | "italic"
  | "mono"
  | "strike"
  | "underline"
  | "spoiler"
  | "url"
  | "mention"
  | "hashtag"
  | "email";

type Span = {
  text: string;
  type: SpanType;
};

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Regex order (longest / highest-priority first):
 *   **bold**         — double-star, no word-boundary needed (** is never in normal text)
 *   __underline__    — only at word boundaries (prevents __init__ false matches)
 *   ~~strike~~       — double-tilde
 *   ||spoiler||      — double-pipe
 *   `mono`           — backtick
 *   _italic_         — only at word boundaries (prevents snake_case false matches)
 *   URL / www / email / @mention / #hashtag
 */
const INLINE_RE =
  /(\*\*[^*\n]+?\*\*|(?<![A-Za-z0-9_])__[^_\n]+?__(?![A-Za-z0-9_])|~~[^~\n]+?~~|\|\|[^|\n]+?\|\||`[^`\n]+?`|(?<![A-Za-z0-9_])_[^_\n]+?_(?![A-Za-z0-9_])|https?:\/\/[^\s<)"'\]]+|www\.[^\s<)"'\]]+\.[^\s<)"'\]]{2,}|[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}|@[A-Za-z0-9_]{1,30}|#[A-Za-z0-9_]{2,30})/g;

function parseRichText(text: string): Span[] {
  if (!text) return [];
  const spans: Span[] = [];
  let last = 0;

  try {
    INLINE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = INLINE_RE.exec(text)) !== null) {
      if (match.index > last) {
        spans.push({ text: text.slice(last, match.index), type: "text" });
      }
      const m = match[0];

      if (m.startsWith("**") && m.endsWith("**")) {
        spans.push({ text: m.slice(2, -2), type: "bold" });
      } else if (m.startsWith("__") && m.endsWith("__")) {
        spans.push({ text: m.slice(2, -2), type: "underline" });
      } else if (m.startsWith("~~") && m.endsWith("~~")) {
        spans.push({ text: m.slice(2, -2), type: "strike" });
      } else if (m.startsWith("||") && m.endsWith("||")) {
        spans.push({ text: m.slice(2, -2), type: "spoiler" });
      } else if (m.startsWith("`") && m.endsWith("`")) {
        spans.push({ text: m.slice(1, -1), type: "mono" });
      } else if (m.startsWith("_") && m.endsWith("_")) {
        spans.push({ text: m.slice(1, -1), type: "italic" });
      } else if (m.startsWith("@")) {
        spans.push({ text: m, type: "mention" });
      } else if (m.startsWith("#")) {
        spans.push({ text: m, type: "hashtag" });
      } else if (m.includes("@") && !m.startsWith("http")) {
        spans.push({ text: m, type: "email" });
      } else {
        spans.push({ text: m, type: "url" });
      }

      last = match.index + m.length;
    }
  } catch {
    return [{ text, type: "text" }];
  }

  if (last < text.length) {
    spans.push({ text: text.slice(last), type: "text" });
  }
  if (spans.length === 0) {
    spans.push({ text, type: "text" });
  }
  return spans;
}

// ─── Colour helper ────────────────────────────────────────────────────────────

/**
 * Safely extract a colour string from a RN style value.
 * `style` may be:
 *   - a plain object  { color: "#fff", ... }
 *   - an array        [StyleSheet-id, { color: "#fff" }]
 *   - undefined
 */
function extractColor(style: any, fallback: string): string {
  if (!style) return fallback;
  if (typeof style === "object" && !Array.isArray(style)) {
    if (typeof style.color === "string") return style.color;
    return fallback;
  }
  if (Array.isArray(style)) {
    for (let i = style.length - 1; i >= 0; i--) {
      const s = style[i];
      if (s && typeof s === "object" && typeof s.color === "string") {
        return s.color;
      }
    }
  }
  return fallback;
}

// ─── Mention avatar ───────────────────────────────────────────────────────────

/** Simple module-level cache: handle (no @) → avatar_url | null */
const _avatarCache = new Map<string, string | null>();

/**
 * Renders an @mention as a small rounded profile picture when the handle
 * resolves to a known user, or as bold unclickable text when not found.
 * On web, always renders as text (inline Image in Text is unreliable there).
 */
function MentionAvatar({
  handle,
  onPress,
  textColor,
  mentionColor,
  showAvatar,
}: {
  handle: string;       // includes the leading @
  onPress?: () => void;
  textColor: string;
  mentionColor: string;
  showAvatar: boolean;
}) {
  const raw = handle.replace("@", "").toLowerCase();
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(
    _avatarCache.has(raw) ? _avatarCache.get(raw) : undefined
  );

  useEffect(() => {
    if (_avatarCache.has(raw)) return;   // already resolved
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("handle", raw)
          .maybeSingle();
        if (cancelled) return;
        const url = (data as any)?.avatar_url ?? null;
        _avatarCache.set(raw, url);
        setAvatarUrl(url);
      } catch {
        if (!cancelled) { _avatarCache.set(raw, null); setAvatarUrl(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [raw]);

  // Channel announcements keep the actual @handle visible so the mentioned
  // username can be clearly highlighted instead of being replaced by an avatar.
  if (!showAvatar) {
    return (
      <Text
        style={[styles.mention, { color: mentionColor }]}
        onPress={onPress}
        suppressHighlighting
      >
        {handle}
      </Text>
    );
  }

  // Still loading — show @handle as a placeholder so layout doesn't jump
  if (avatarUrl === undefined) {
    return (
      <Text style={[styles.mention, { color: mentionColor }]}>{handle}</Text>
    );
  }

  // User not found — bold, unclickable
  if (avatarUrl === null) {
    return (
      <Text
        style={[styles.bold, { color: mentionColor }]}
        onPress={onPress}
        suppressHighlighting
      >
        {handle}
      </Text>
    );
  }

  // Web — inline Image inside Text is unreliable; fall back to tappable text
  if (Platform.OS === "web") {
    return (
      <Text
        style={[styles.mention, { color: mentionColor }]}
        onPress={onPress}
        suppressHighlighting
      >
        {handle}
      </Text>
    );
  }

  // Native — small rounded avatar inline with the message text
  return (
    <Text onPress={onPress} suppressHighlighting>
      <Image source={{ uri: avatarUrl }} style={styles.mentionAvatar} />
    </Text>
  );
}

// ─── Spoiler span ─────────────────────────────────────────────────────────────

/**
 * Cross-platform spoiler:
 *   • Hidden  — characters replaced with ■■■, shown at 50% opacity
 *   • Revealed — real text at full opacity
 *
 * We avoid `backgroundColor` on a nested <Text> (unreliable on older iOS/Android)
 * and `color: "transparent"` (which still takes space but shows nothing on some
 * engines). The ■■■ mask approach is reliable everywhere.
 */
function SpoilerSpan({
  text,
  textColor,
}: {
  text: string;
  textColor: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const mask = text.replace(/[^\n]/g, "■");

  return (
    <Text
      onPress={() => setRevealed((v) => !v)}
      style={{
        color: textColor,
        opacity: revealed ? 1 : 0.45,
      }}
    >
      {revealed ? text : mask}
    </Text>
  );
}

// ─── RichText ─────────────────────────────────────────────────────────────────

type RichTextProps = {
  children: string;
  style?: any;
  linkColor?: string;
  numberOfLines?: number;
  selectable?: boolean;
  /** When true, @mentions render as plain (non-tappable) bold text instead
   *  of navigable links.  Use in feed post bodies where mentions should
   *  stay in-place but not trigger navigation. */
  plainMentions?: boolean;
  /** When false, channel mentions stay visible as highlighted @handles
   *  instead of being replaced by inline profile avatars. */
  showMentionAvatars?: boolean;
  /** Transparent inline spacer appended after all spans — used for the
   *  WhatsApp-style timestamp ghost: reserves horizontal space on the last
   *  line so the real (absolute-positioned) timestamp never overlaps text. */
  tail?: React.ReactNode;
};

export function RichText({
  children,
  style,
  linkColor,
  numberOfLines,
  selectable,
  plainMentions,
  showMentionAvatars = true,
  tail,
}: RichTextProps) {
  const { accent } = useAppAccent();
  const openLink = useOpenLink();
  const { showLinkSheet } = useOpenLinkActions();
  const { session } = useAuth();
  const effectiveLinkColor = linkColor ?? accent;

  function handlePress(span: Span) {
    switch (span.type) {
      case "url": {
        let url = span.text;
        if (!url.startsWith("http")) url = "https://" + url;
        openLink(url);
        break;
      }
      case "email":
        Linking.openURL(`mailto:${span.text}`).catch(() => {});
        break;
      case "mention": {
        navigateToProfile(span.text, !!session).catch(() => {});
        break;
      }
      case "hashtag": {
        const tag = span.text.replace("#", "");
        router.push({ pathname: "/(tabs)/search", params: { tag } });
        break;
      }
    }
  }

  if (!children) {
    return (
      <Text style={style} selectable={selectable}>
        {""}
      </Text>
    );
  }

  const spans = useMemo(() => parseRichText(children), [children]);

  const inheritedColor = extractColor(style, "#000000");

  return (
    <Text style={style} numberOfLines={numberOfLines} selectable={selectable}>
      {spans.map((span, i) => {
        switch (span.type) {
          case "bold":
            return (
              <Text
                key={i}
                style={[styles.bold, { color: inheritedColor }]}
                selectable={selectable}
              >
                {span.text}
              </Text>
            );
          case "italic":
            return (
              <Text
                key={i}
                style={[styles.italic, { color: inheritedColor }]}
                selectable={selectable}
              >
                {span.text}
              </Text>
            );
          case "mono":
            return (
              <Text
                key={i}
                style={[styles.mono, { color: effectiveLinkColor }]}
                selectable={selectable}
              >
                {span.text}
              </Text>
            );
          case "strike":
            return (
              <Text
                key={i}
                style={[styles.strike, { color: inheritedColor }]}
                selectable={selectable}
              >
                {span.text}
              </Text>
            );
          case "underline":
            return (
              <Text
                key={i}
                style={[styles.underline, { color: inheritedColor }]}
                selectable={selectable}
              >
                {span.text}
              </Text>
            );
          case "spoiler":
            return (
              <SpoilerSpan
                key={i}
                text={span.text}
                textColor={inheritedColor}
              />
            );
          case "url":
            return (
              <Text
                key={i}
                style={[styles.link, { color: effectiveLinkColor }]}
                onPress={() => handlePress(span)}
                onLongPress={selectable ? undefined : () => {
                  let url = span.text;
                  if (!url.startsWith("http")) url = "https://" + url;
                  showLinkSheet(url);
                }}
                selectable={selectable}
                suppressHighlighting
              >
                {span.text}
              </Text>
            );
          case "hashtag":
            return (
              <Text
                key={i}
                style={[styles.bold, { color: inheritedColor }]}
                onPress={() => handlePress(span)}
                selectable={selectable}
                suppressHighlighting
              >
                {span.text}
              </Text>
            );
          case "mention":
            return (
              <MentionAvatar
                key={i}
                handle={span.text}
                onPress={plainMentions ? undefined : () => handlePress(span)}
                textColor={inheritedColor}
                mentionColor={effectiveLinkColor}
                showAvatar={showMentionAvatars}
              />
            );
          case "email":
            return (
              <Text
                key={i}
                style={[styles.link, { color: effectiveLinkColor }]}
                onPress={() => handlePress(span)}
                selectable={selectable}
              >
                {span.text}
              </Text>
            );
          default:
            return (
              <Text
                key={i}
                style={{ color: inheritedColor }}
                selectable={selectable}
              >
                {span.text}
              </Text>
            );
        }
      })}
      {tail}
    </Text>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bold: {
    fontFamily: "Inter_700Bold",
  },
  italic: {
    fontStyle: "italic",
  },
  mono: {
    fontFamily: "monospace" as any,
    fontSize: 13,
  },
  strike: {
    textDecorationLine: "line-through",
  },
  underline: {
    textDecorationLine: "underline",
  },
  link: {
    fontFamily: "Inter_500Medium",
  },
  mention: {
    fontFamily: "Inter_600SemiBold",
  },
  mentionAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    overflow: "hidden" as const,
    marginTop: 2,
  },
});
