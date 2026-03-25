import React, { useCallback, useEffect, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Note = { id: string; title: string; body: string; color: string; updatedAt: number };

const NOTE_COLORS = ["#FFE0B2", "#C8E6C9", "#BBDEFB", "#E1BEE7", "#F8BBD0", "#B2DFDB", "#FFF9C4"];
const STORAGE_KEY = "afuchat_notes";

export default function NotesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((d) => {
      if (d) setNotes(JSON.parse(d));
    }).catch(() => {});
  }, []);

  const save = useCallback((updated: Note[]) => {
    setNotes(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  const addNote = () => {
    Haptics.selectionAsync();
    const note: Note = {
      id: Date.now().toString(),
      title: "",
      body: "",
      color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
      updatedAt: Date.now(),
    };
    setEditing(note);
  };

  const saveNote = () => {
    if (!editing) return;
    if (!editing.title.trim() && !editing.body.trim()) {
      setEditing(null);
      return;
    }
    Haptics.selectionAsync();
    const updated = notes.filter((n) => n.id !== editing.id);
    updated.unshift({ ...editing, updatedAt: Date.now() });
    save(updated);
    setEditing(null);
  };

  const deleteNote = (id: string) => {
    Haptics.notificationAsync("warning");
    save(notes.filter((n) => n.id !== id));
  };

  const filtered = notes.filter((n) =>
    !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.body.toLowerCase().includes(search.toLowerCase())
  );

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  if (editing) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={saveNote}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Note</Text>
          <TouchableOpacity onPress={saveNote}>
            <Text style={[styles.saveBtn, { color: Colors.brand }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.editContent}>
          <View style={styles.colorRow}>
            {NOTE_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, { backgroundColor: c, borderWidth: editing.color === c ? 3 : 0, borderColor: Colors.brand }]}
                onPress={() => setEditing({ ...editing, color: c })}
              />
            ))}
          </View>
          <TextInput
            style={[styles.titleInput, { color: colors.text }]}
            value={editing.title}
            onChangeText={(t) => setEditing({ ...editing, title: t })}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <TextInput
            style={[styles.bodyInput, { color: colors.text }]}
            value={editing.body}
            onChangeText={(t) => setEditing({ ...editing, body: t })}
            placeholder="Start typing..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Quick Notes</Text>
        <TouchableOpacity onPress={addNote}><Ionicons name="add" size={24} color={Colors.brand} /></TouchableOpacity>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.inputBg, marginHorizontal: 16, marginTop: 12 }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes..."
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.noteCard, { backgroundColor: item.color }]}
            activeOpacity={0.7}
            onPress={() => setEditing(item)}
            onLongPress={() => deleteNote(item.id)}
          >
            {item.title ? <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text> : null}
            <Text style={styles.noteBody} numberOfLines={4}>{item.body || "Empty note"}</Text>
            <Text style={styles.noteTime}>{timeAgo(item.updatedAt)}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No notes yet. Tap + to create one!</Text>
          </View>
        }
      />

      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24, backgroundColor: Colors.brand }]} onPress={addNote}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 10 },
  editContent: { padding: 16, gap: 12 },
  colorRow: { flexDirection: "row", gap: 10 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  titleInput: { fontSize: 22, fontFamily: "Inter_700Bold" },
  bodyInput: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 24, minHeight: 200 },
  gridRow: { gap: 12 },
  noteCard: { flex: 1, borderRadius: 14, padding: 14, gap: 6, maxWidth: "48%" },
  noteTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#333" },
  noteBody: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#555", lineHeight: 18 },
  noteTime: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#888", marginTop: 4 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
});
