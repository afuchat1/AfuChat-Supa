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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { CHAT_FAST_DURATION, CHAT_FAST_SPRING } from "@/lib/chatMotion";
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
  { key: "personal", label: "Personal", icon: "person" },
  { key: "groups",   label: "Groups",   icon: "people" },
  { key: "channels", label: "Channels", icon: "megaphone" },
  { key: "unread",   label: "Unread",   icon: "mail-unread" },
];

type Props = {
  visible: boolean;
  initial?: ChatFolder | null;
  onSave: (data: { name: string; icon: string; filter: FolderFilter }) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function FolderModal({ visible, initial, onSave, onDelete, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
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
        ...CHAT_FAST_SPRING,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: CHAT_FAST_DURATION,
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
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={st.kav}
        >
          <Animated.View
            style={[st.sheetWrap, { transform: [{ translateY: slideAnim }] }]}
          >
            <View style={[st.sheetBlur, { backgroundColor: colors.surface }]}>
            <Pressable onPress={() => {}}>
              <View style={[st.handle, { backgroundColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)" }]} />

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
                      {
                        borderColor: icon === em ? colors.accent : (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"),
                        backgroundColor: icon === em
                          ? colors.accent + "22"
                          : (isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)"),
                      },
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
                  {
                    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.72)",
                    borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
                  },
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
                      activeOpacity={0.7}
                      style={[
                        st.filterPillWrap,
                        {
                          ...Platform.select({
                            web: { boxShadow: "0 2px 8px rgba(0,0,0,0.12)" } as any,
                            default: {
                              shadowColor: "#000",
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.12,
                              shadowRadius: 6,
                              elevation: 3,
                            },
                          }),
                        },
                      ]}
                    >
                      <View
                        style={[
                          st.filterChip,
                          {
                            borderColor: active
                              ? colors.accent + "66"
                              : (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"),
                            backgroundColor: active
                              ? colors.accent + "28"
                              : (isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.72)"),
                          },
                        ]}
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
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Action buttons */}
              <View style={[st.actions, { paddingBottom: Math.max(insets.bottom, 8) }]}>
                {isEditing && onDelete && (
                  <TouchableOpacity
                    style={[
                      st.deleteBtn,
                      {
                        borderColor: "rgba(255,59,48,0.35)",
                        backgroundColor: "rgba(255,59,48,0.08)",
                      },
                    ]}
                    onPress={onDelete}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash" size={16} color="#FF3B30" />
                    <Text style={[st.deleteBtnText, { color: "#FF3B30" }]}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    st.saveBtn,
                    {
                      flex: 1,
                      backgroundColor: canSave ? colors.accent : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"),
                    },
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
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#00000055", justifyContent: "flex-end" },
  kav:      { justifyContent: "flex-end" },
  sheetWrap: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  sheetBlur: {
    paddingTop: 12,
  },
  sheetBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    pointerEvents: "none",
  } as any,
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
  iconScrollContent: { paddingHorizontal: 16, gap: 8 },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.10)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 2 },
    }),
  },
  iconEmoji: { fontSize: 22 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 22,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
    ...Platform.select({
      web: { boxShadow: "0 4px 20px rgba(0,0,0,0.12)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 },
    }),
  },
  inputIcon: { fontSize: 22 },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    height: 52,
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
  filterPillWrap: {
    borderRadius: 999,
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 14 },
  actions: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 4,
    paddingBottom: 0, /* insets applied inline */
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  saveBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 999,
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
