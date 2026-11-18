/**
 * FormatToolbar
 * Appears above the chat input whenever the user has text selected.
 *
 * Level 1 — app-owned actions: Cut · Copy · Paste · Quote · ⋮
 * Level 2 — formatting: Bold · Italic · Mono · Spoiler · Strike · Underline
 *
 * The parent must pass:
 *   visible   — whether to show (true when selection.start < selection.end)
 *   selection — current {start, end} from onSelectionChange
 *   value     — full text input value
 *   onFormat  — called with the new string after applying a format
 *   onClose   — called when the toolbar should hide (selection cleared)
 */
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";

type Props = {
  visible: boolean;
  selection: { start: number; end: number };
  value: string;
  onFormat: (newText: string) => void;
  onClose: () => void;
};

type Level = "actions" | "format";

export default function FormatToolbar({
  visible,
  selection,
  value,
  onFormat,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const { accent } = useAppAccent();
  const [level, setLevel] = useState<Level>("actions");

  useEffect(() => {
    if (!visible) setLevel("actions");
  }, [visible]);

  if (!visible || selection.start >= selection.end) return null;

  const { start, end } = selection;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  function wrap(open: string, close: string) {
    onFormat(before + open + selected + close + after);
    onClose();
  }

  const btnStyle = [
    s.btn,
    {
      backgroundColor: colors.backgroundTertiary as string,
      borderColor: colors.backgroundTertiary as string,
    },
  ];

  return (
    <View
      style={[
        s.container,
        {
          backgroundColor: colors.surface as string,
          borderColor: colors.backgroundTertiary as string,
        },
      ]}
    >
      {level === "actions" ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.row}
          keyboardShouldPersistTaps="always"
        >
          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Cut selected text"
            testID="chat-format-cut"
            onPress={async () => {
              await Clipboard.setStringAsync(selected);
              onFormat(before + after);
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string }]}>Cut</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Copy selected text"
            testID="chat-format-copy"
            onPress={async () => {
              await Clipboard.setStringAsync(selected);
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string }]}>Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Paste text"
            testID="chat-format-paste"
            onPress={async () => {
              const pasted = await Clipboard.getStringAsync();
              if (!pasted) return;
              onFormat(before + pasted + after);
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string }]}>Paste</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Quote selected text"
            testID="chat-format-quote"
            onPress={() => {
              const lines = selected
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n");
              onFormat(before + lines + after);
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string }]}>Quote</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[btnStyle, s.moreBtn, { borderColor: accent + "60", backgroundColor: accent + "15" }]}
            accessibilityRole="button"
            accessibilityLabel="More text formatting"
            testID="chat-format-more"
            onPress={() => setLevel("format")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: accent, fontFamily: "Inter_700Bold" }]}>
              ⋮
            </Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.row}
          keyboardShouldPersistTaps="always"
        >
          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Bold"
            testID="chat-format-bold"
            onPress={() => wrap("**", "**")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string, fontFamily: "Inter_700Bold" }]}>Bold</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Italic"
            testID="chat-format-italic"
            onPress={() => wrap("_", "_")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string, fontStyle: "italic" }]}>Italic</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Monospace"
            testID="chat-format-monospace"
            onPress={() => wrap("`", "`")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: accent, fontFamily: Platform.select({ web: "monospace", default: "Inter_400Regular" }) }]}>Mono</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Strikethrough"
            testID="chat-format-strike"
            onPress={() => wrap("~~", "~~")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string, textDecorationLine: "line-through" }]}>Strike</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Spoiler"
            testID="chat-format-spoiler"
            onPress={() => wrap("||", "||")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string }]}>Spoiler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Underline"
            testID="chat-format-underline"
            onPress={() => wrap("__", "__")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string, textDecorationLine: "underline" }]}>
              Underline
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[btnStyle, s.moreBtn, { borderColor: accent + "60", backgroundColor: accent + "15" }]}
            accessibilityRole="button"
            accessibilityLabel="Back to text actions"
            testID="chat-format-back"
            onPress={() => setLevel("actions")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: accent, fontFamily: "Inter_600SemiBold" }]}>
              ←
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 2,
    marginHorizontal: 8,
    marginBottom: 4,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 3,
    gap: 2,
    alignItems: "center",
  },
  btn: {
    minHeight: 29,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  moreBtn: {
    minWidth: 28,
    paddingHorizontal: 5,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
