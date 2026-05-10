import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { ChatFolder, FolderFilter } from "@/lib/storage/chatFolders";

const ICONS = [
  "📁", "💬", "👤", "👥", "📢", "⭐", "❤️", "🔔",
  "🏠", "💼", "🎮", "📚", "🎵", "✈️", "🌍", "🔒",
  "💡", "🎯", "🛒", "🎉",
];

const FILTERS: {
  key: FolderFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "personal", label: "Personal", icon: "person-outline" },
  { key: "groups",   label: "Groups",   icon: "people-outline" },
  { key: "channels", label: "Channels", icon: "megaphone-outline" },
  { key: "unread",   label: "Unread",   icon: "mail-unread-outline" },
];

type Props = {
  visible: boolean;
  initial?: ChatFolder | null;
  onSave: (data: { name: string; icon: string; filter: FolderFilter }) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function FolderModal({ visible, initial, onSave, onDelete, onClose }: Props) {
  const { colors } = useTheme();
  const [name, setName]     = useState("");
  const [icon, setIcon]     = useState("📁");
  const [filter, setFilter] = useState<FolderFilter>("personal");
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? "");
      setIcon(initial?.icon ?? "📁");
      setFilter(initial?.filter ?? "personal");
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        speed: 22,
        bounciness: 3,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, initial, slideAnim]);

  const isEditing = !!initial;
  const canSave   = name.trim().length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave({ name: name.trim(), icon, filter });
  }, [canSave, name, icon, filter, onSave]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={st.kav}
        >
          <Animated.View
            style={[
              st.sheet,
              { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <Pressable onPress={() => {}}>
              <View style={[st.handle, { backgroundColor: colors.border }]} />

              <Text style={[st.title, { color: colors.text }]}>
                {isEditing ? "Edit Folder" : "New Folder"}
              </Text>

              {/* Icon picker */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={st.iconScroll}
                contentContainerStyle={st.iconScrollContent}
              >
                {ICONS.map((em) => (
                  <TouchableOpacity
                    key={em}
                    onPress={() => setIcon(em)}
                    style={[
                      st.iconBubble,
                      { borderColor: icon === em ? colors.accent : colors.border },
                      icon === em && { backgroundColor: colors.accent + "18" },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={st.iconEmoji}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Name input */}
              <View
                style={[
                  st.inputRow,
                  { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                ]}
              >
                <Text style={st.inputIcon}>{icon}</Text>
                <TextInput
                  style={[st.input, { color: colors.text }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Folder name…"
                  placeholderTextColor={colors.textMuted}
                  autoFocus={!isEditing}
                  maxLength={30}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>

              {/* Filter type */}
              <Text style={[st.sectionLabel, { color: colors.textMuted }]}>
                INCLUDE CHATS FROM
              </Text>
              <View style={st.filterGrid}>
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      onPress={() => setFilter(f.key)}
                      style={[
                        st.filterChip,
                        {
                          borderColor: active ? colors.accent : colors.border,
                          backgroundColor: active
                            ? colors.accent + "18"
                            : colors.backgroundSecondary,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={f.icon}
                        size={15}
                        color={active ? colors.accent : colors.textMuted}
                      />
                      <Text
                        style={[
                          st.filterLabel,
                          {
                            color: active ? colors.accent : colors.textMuted,
                            fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                          },
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Action buttons */}
              <View style={st.actions}>
                {isEditing && onDelete && (
                  <TouchableOpacity
                    style={[st.deleteBtn, { borderColor: "#FF3B3066" }]}
                    onPress={onDelete}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                    <Text style={[st.deleteBtnText, { color: "#FF3B30" }]}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    st.saveBtn,
                    { flex: 1, backgroundColor: canSave ? colors.accent : colors.backgroundSecondary },
                  ]}
                  onPress={handleSave}
                  disabled={!canSave}
                  activeOpacity={0.8}
                >
                  <Text style={[st.saveBtnText, { color: canSave ? "#fff" : colors.textMuted }]}>
                    {isEditing ? "Save changes" : "Create folder"}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#00000060", justifyContent: "flex-end" },
  kav:      { justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    paddingTop: 10,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  iconScroll: { marginBottom: 18 },
  iconScrollContent: { paddingHorizontal: 16, gap: 10 },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: { fontSize: 22 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 22,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  inputIcon: { fontSize: 22 },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    height: 50,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 16,
    gap: 8,
    marginBottom: 24,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  filterLabel: { fontSize: 14 },
  actions: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 10,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  saveBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
