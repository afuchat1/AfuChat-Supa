import React from "react";
import { Text, StyleSheet, Linking } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

type RichTextProps = {
  children: string;
  style?: any;
  linkColor?: string;
  numberOfLines?: number;
};

type Segment = {
  text: string;
  type: "text" | "url" | "mention" | "hashtag" | "email";
};

const URL_REGEX = /https?:\/\/[^\s<)]+|www\.[^\s<)]+\.[^\s<)]+/gi;
const MENTION_REGEX = /@(\w{1,30})/g;
const HASHTAG_REGEX = /#(\w{2,30})/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function parseText(text: string): Segment[] {
  if (!text) return [];

  const matches: { start: number; end: number; text: string; type: Segment["type"] }[] = [];

  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], type: "url" });
  }

  EMAIL_REGEX.lastIndex = 0;
  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], type: "email" });
  }

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], type: "mention" });
  }

  HASHTAG_REGEX.lastIndex = 0;
  while ((match = HASHTAG_REGEX.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], type: "hashtag" });
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: typeof matches = [];
  for (const m of matches) {
    if (merged.length > 0 && m.start < merged[merged.length - 1].end) continue;
    merged.push(m);
  }

  matches.length = 0;
  matches.push(...merged);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const m of matches) {
    if (m.start > cursor) {
      segments.push({ text: text.slice(cursor, m.start), type: "text" });
    }
    segments.push({ text: m.text, type: m.type });
    cursor = m.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), type: "text" });
  }

  if (segments.length === 0) {
    segments.push({ text, type: "text" });
  }

  return segments;
}

function handlePress(segment: Segment) {
  switch (segment.type) {
    case "url": {
      let url = segment.text;
      if (!url.startsWith("http")) url = "https://" + url;
      Linking.openURL(url).catch(() => {});
      break;
    }
    case "email": {
      Linking.openURL(`mailto:${segment.text}`).catch(() => {});
      break;
    }
    case "mention": {
      const handle = segment.text.replace("@", "");
      supabase
        .from("profiles")
        .select("id")
        .eq("handle", handle)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.id) {
            router.push({ pathname: "/contact/[id]", params: { id: data.id } });
          }
        });
      break;
    }
    case "hashtag": {
      break;
    }
  }
}

export function RichText({ children, style, linkColor = "#34A853", numberOfLines }: RichTextProps) {
  if (!children) return <Text style={style}>{""}</Text>;
  const segments = parseText(children);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <Text key={i}>{seg.text}</Text>;
        }
        return (
          <Text
            key={i}
            style={[
              styles.link,
              { color: linkColor },
              seg.type === "mention" && styles.mention,
            ]}
            onPress={() => handlePress(seg)}
          >
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    fontFamily: "Inter_500Medium",
  },
  mention: {
    fontFamily: "Inter_600SemiBold",
  },
});
