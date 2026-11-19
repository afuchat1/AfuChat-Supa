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
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";

type TextRange = { start: number; end: number };

type Props = {
  visible: boolean;
  selection: TextRange;
  value: string;
  onFormat: (newText: string, nextSelection: TextRange) => void;
  onKeepSelection: () => void;
};

export default function FormatToolbar({
  visible,
  selection,
  value,
  onFormat,
  onKeepSelection,
}: Props) {
  const { colors } = useTheme();
  const { accent } = useAppAccent();

  if (!visible || selection.start >= selection.end) return null;

  const { start, end } = selection;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  function wrap(open: string, close: string) {
    const selectedStart = start + open.length;
    onFormat(before + open + selected + close + after, {
      start: selectedStart,
      end: selectedStart + selected.length,
    });
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
      onTouchStart={onKeepSelection}
      style={[
        s.container,
        {
          backgroundColor: colors.surface as string,
          borderColor: colors.backgroundTertiary as string,
        },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
        keyboardShouldPersistTaps="always"
        directionalLockEnabled
        nestedScrollEnabled
      >
          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Cut selected text"
            testID="chat-format-cut"
            onPressIn={onKeepSelection}
            onPress={async () => {
              await Clipboard.setStringAsync(selected);
              onFormat(before + after, { start, end: start });
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
            onPressIn={onKeepSelection}
            onPress={async () => {
              await Clipboard.setStringAsync(selected);
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
            onPressIn={onKeepSelection}
            onPress={async () => {
              const pasted = await Clipboard.getStringAsync();
              if (!pasted) return;
              onFormat(before + pasted + after, {
                start,
                end: start + pasted.length,
              });
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
            onPressIn={onKeepSelection}
            onPress={() => {
              const lines = selected
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n");
              onFormat(before + lines + after, {
                start,
                end: start + lines.length,
              });
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string }]}>Quote</Text>
          </TouchableOpacity>

          <View
            accessibilityElementsHidden
            style={[s.divider, { backgroundColor: colors.border as string }]}
          />
          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Bold"
            testID="chat-format-bold"
            onPressIn={onKeepSelection}
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
            onPressIn={onKeepSelection}
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
            onPressIn={onKeepSelection}
            onPress={() => wrap("`", "`")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: accent, fontFamily: "Inter_600SemiBold" }]}>Mono</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btnStyle}
            accessibilityRole="button"
            accessibilityLabel="Strikethrough"
            testID="chat-format-strike"
            onPressIn={onKeepSelection}
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
            onPressIn={onKeepSelection}
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
            onPressIn={onKeepSelection}
            onPress={() => wrap("__", "__")}
            activeOpacity={0.7}
          >
            <Text style={[s.label, { color: colors.text as string, textDecorationLine: "underline" }]}>
              Underline
            </Text>
          </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    maxWidth: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: 5,
    marginHorizontal: 8,
    marginBottom: 6,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 6,
    gap: 7,
    alignItems: "center",
  },
  btn: {
    minHeight: 46,
    minWidth: 54,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    marginHorizontal: 2,
  },
  label: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
