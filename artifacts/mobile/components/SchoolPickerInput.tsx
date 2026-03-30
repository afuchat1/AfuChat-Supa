import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

const BRAND = "#FF2D55";
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
  const searchRef = useRef<TextInput>(null);

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
          { backgroundColor: colors.surface, borderColor: hasValue ? BRAND : colors.border },
        ]}
        onPress={openModal}
      >
        <Ionicons
          name="school-outline"
          size={18}
          color={hasValue ? BRAND : colors.textMuted}
          style={{ marginRight: 10 }}
        />
        <Text
          style={[styles.triggerText, { color: hasValue ? colors.text : colors.textMuted }]}
          numberOfLines={1}
        >
          {hasValue ? displayText : (placeholder ?? "Select your school or university")}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={BRAND} />
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
          ? `${allSchools.length} schools in ${country} — tap to browse`
          : `No schools found for ${country}`}
      </Text>

      {/* Full-screen modal picker */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOpen(false)}
      >
        <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background ?? colors.surface }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select School</Text>
            <Pressable onPress={() => setModalOpen(false)} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={BRAND} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                Loading schools{country ? ` in ${country}` : ""}…
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.loadingWrap}>
              <Ionicons name="school-outline" size={48} color={colors.textMuted} />
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
                    pressed && { backgroundColor: BRAND + "12" },
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons name="school-outline" size={18} color={colors.textMuted} />
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
                    <Ionicons name="checkmark-circle" size={20} color={BRAND} />
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
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
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
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
});
