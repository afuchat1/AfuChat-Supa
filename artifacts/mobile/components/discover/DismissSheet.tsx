import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { SmartSheet } from "@/components/ui/SmartSheet";
import { Separator } from "@/components/ui/Separator";

export type DismissReason =
  | "not_interested"
  | "already_seen"
  | "mute_author"
  | "not_relevant"
  | "spam";

type Props = {
  visible: boolean;
  authorHandle: string;
  onSelect: (reason: DismissReason) => void;
  onClose: () => void;
};

const REASONS: { key: DismissReason; label: string; icon: string }[] = [
  { key: "not_interested",  label: "Not interested in this",         icon: "thumbs-down"  },
  { key: "not_relevant",   label: "Not relevant to me",              icon: "funnel"        },
  { key: "already_seen",   label: "I've already seen this",          icon: "eye-off"       },
  { key: "mute_author",    label: "Too many posts from this person", icon: "volume-mute"   },
  { key: "spam",           label: "It looks like spam",              icon: "alert-circle"  },
];

export function DismissSheet({ visible, authorHandle: _authorHandle, onSelect, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <SmartSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={colors.surface}
      handleColor={colors.border}
      peekFraction={0.5}
    >
      <Separator />

      {REASONS.map((r) => (
        <TouchableOpacity
          key={r.key}
          style={styles.row}
          onPress={() => onSelect(r.key)}
          activeOpacity={0.65}
        >
          <Ionicons name={r.icon as any} size={24} color={colors.text} style={styles.rowIcon} />
          <Text style={[styles.rowLabel, { color: colors.text }]}>{r.label}</Text>
        </TouchableOpacity>
      ))}

      <Separator />
    </SmartSheet>
  );
}

const styles = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, minHeight: 56 },
  rowIcon: { marginRight: 18, width: 24, textAlign: "center" },
  rowLabel:{ flex: 1, fontSize: 16, fontFamily: "Inter_700Bold" },
});
