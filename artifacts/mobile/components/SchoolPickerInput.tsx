import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { ListRowSkeleton } from "@/components/ui/Skeleton";

const API_BASE = "https://universities.hipolabs.com/search";

interface SchoolResult {
  name: string;
  country: string;
  alpha_two_code: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  country?: string;
  placeholder?: string;
}

export default function SchoolPickerInput({ value, onChange, country, placeholder }: Props) {
  const { colors, isDark } = useTheme();
  const [allSchools, setAllSchools] = useState<SchoolResult[]>([]);
  const [filtered, setFiltered] = useState<SchoolResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const prevCountry = useRef("");
  const searchRef = useRef<AfuNativeRef.TextInput>(null);

  // Load all schools whenever country changes
  useEffect(() => {
    if (!country || country === prevCountry.current) return;
    prevCountry.current = country;
    setAllSchools([]);
    setFiltered([]);
    fetchAll(country);
  }, [country]);

  async function fetchAll(c: string) {
    setLoading(true);
    try {
      const url = `${API_BASE}?country=${encodeURIComponent(c.trim())}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const data: SchoolResult[] = await res.json();
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
      setAllSchools(sorted);
      setFiltered(sorted);
    } catch {
      setAllSchools([]);
      setFiltered([]);
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setSearchQuery("");
    setFiltered(allSchools);
    setModalOpen(true);
    // Auto-focus search after modal opens
    setTimeout(() => searchRef.current?.focus(), 300);
  }

  function handleSearch(text: string) {
    setSearchQuery(text);
    if (!text.trim()) {
      setFiltered(allSchools);
      return;
    }
    const q = text.toLowerCase();
    setFiltered(allSchools.filter((s) => s.name.toLowerCase().includes(q)));
  }

  function handleSelect(item: SchoolResult) {
    onChange(item.name);
    setModalOpen(false);
  }

  function handleClearValue() {
    onChange("");
  }

  const displayText = value || "";
  const hasValue = displayText.length > 0;

  return (
    <View style={styles.wrapper}>
      {/* Trigger button — shows current value or placeholder */}
      <Pressable
        style={[
          styles.trigger,
          { backgroundColor: colors.surface },
        ]}
        onPress={openModal}
      >
        <Ionicons
          name="school"
          size={18}
          color={hasValue ? colors.accent : colors.textMuted}
          style={{ marginRight: 10 }}
        />
        <Text
          style={[styles.triggerText, { color: hasValue ? colors.text : colors.textMuted }]}
          numberOfLines={1}
        >
          {hasValue ? displayText : (placeholder ?? "Select your school or university")}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : hasValue ? (
          <Pressable onPress={handleClearValue} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        )}
      </Pressable>

      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {!country
          ? "Your country will be used to load local schools"
          : loading
          ? `Loading schools in ${country}…`
          : allSchools.length > 0
            ? `${allSchools.length} schools in ${country}. Tap to browse`
          : `No schools found for ${country}`}
      </Text>

      {/* Full-screen modal picker */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOpen(false)}
      >
        <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select School</Text>
            <Pressable onPress={() => setModalOpen(false)} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={[styles.searchRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchRef}
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name…"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={handleSearch}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => handleSearch("")} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Result count */}
          <Text style={[styles.countText, { color: colors.textMuted }]}>
            {filtered.length === allSchools.length
              ? `${allSchools.length} schools`
              : `${filtered.length} of ${allSchools.length} schools`}
            {country ? ` in ${country}` : ""}
          </Text>

          {/* School list */}
          {loading ? (
            <View style={{ padding: 12, gap: 8 }}>{[1,2,3,4,5,6].map(i => <ListRowSkeleton key={i} />)}</View>
          ) : filtered.length === 0 ? (
            <View style={styles.loadingWrap}>
              <Ionicons name="school" size={48} color={colors.textMuted} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                {searchQuery ? "No matching schools found" : "No schools available"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item, i) => `${item.name}-${i}`}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              initialNumToRender={20}
              maxToRenderPerBatch={30}
              windowSize={10}
              ItemSeparatorComponent={() => (
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
              )}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.resultRow,
                    pressed && { backgroundColor: colors.accent + "12" },
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons name="school" size={18} color={colors.textMuted} />
                  </View>
                  <View style={styles.resultTextWrap}>
                    <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={[styles.resultCountry, { color: colors.textMuted }]}>
                      {item.country}
                    </Text>
                  </View>
                  {value === item.name && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  )}
                </Pressable>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { zIndex: 100 },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 0.5,
    ...Platform.select({ web: { boxShadow: "0 3px 12px rgba(0,0,0,0.13)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 8 } }),
  },
  triggerText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 5, marginLeft: 2 },

  // Modal
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 0.5,
    ...Platform.select({ web: { boxShadow: "0 3px 12px rgba(0,0,0,0.13)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 8 } }),
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  countText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  resultIcon: { width: 32, alignItems: "center" },
  resultTextWrap: { flex: 1, marginHorizontal: 10 },
  resultName: { fontSize: 15, fontFamily: "Inter_500Medium", lineHeight: 20 },
  resultCountry: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  separator: { height: 0.5, marginLeft: 62 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
});
