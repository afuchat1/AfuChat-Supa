import React, { useState, useCallback, useEffect } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAutoTranslate } from "@/context/LanguageContext";
import { RichText } from "@/components/ui/RichText";
import { LANG_LABELS } from "@/lib/translate";

type Props = {
  text: string;
  maxLines?: number;
  style?: any;
  translate?: boolean;
  richText?: boolean;
};

const WEB_CHARS_PER_LINE = 58;

export function ExpandableText({
  text,
  maxLines = 3,
  style,
  translate = false,
  richText = false,
}: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [needsExpander, setNeedsExpander] = useState(false);
  const [measured, setMeasured] = useState(false);

  const autoTranslate = useAutoTranslate(translate ? text : null);
  const displayText = translate ? autoTranslate.displayText || text : text;
  const isTranslated = translate && autoTranslate.isTranslated;
  const lang = translate ? autoTranslate.lang : null;

  useEffect(() => {
    setMeasured(false);
    setNeedsExpander(false);
    setExpanded(false);
  }, [displayText]);

  useEffect(() => {
    if (Platform.OS === "web" && !measured) {
      setMeasured(true);
      const lines = Math.ceil((displayText || "").length / WEB_CHARS_PER_LINE);
      if (lines > maxLines) setNeedsExpander(true);
    }
  }, [displayText, measured, maxLines]);

  const onTextLayout = useCallback(
    (e: any) => {
      if (!measured) {
        setMeasured(true);
        if ((e.nativeEvent?.lines?.length || 0) > maxLines) {
          setNeedsExpander(true);
        }
      }
    },
    [measured, maxLines]
  );

  const shownLines = expanded || !needsExpander ? undefined : maxLines;

  return (
    <View>
      {!measured && Platform.OS !== "web" && (
        <Text
          key={displayText}
          style={[style, st.hidden]}
          onTextLayout={onTextLayout}
        >
          {displayText}
        </Text>
      )}

      {richText ? (
        <RichText style={style} numberOfLines={shownLines}>
          {displayText || ""}
        </RichText>
      ) : (
        <Text style={style} numberOfLines={shownLines}>
          {displayText}
        </Text>
      )}

      {needsExpander && (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.65}
        >
          <Text style={[st.toggle, { color: colors.accent }]}>
            {expanded ? "See less" : "See more"}
          </Text>
        </TouchableOpacity>
      )}

      {isTranslated && lang && (
        <View style={st.translatedBadge}>
          <Ionicons name="language" size={11} color={colors.textMuted} />
          <Text style={[st.translatedText, { color: colors.textMuted }]}>
            Translated · {LANG_LABELS[lang] ?? lang}
          </Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  hidden: {
    position: "absolute",
    opacity: 0,
    zIndex: -1,
  },
  toggle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  translatedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
  },
  translatedText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
