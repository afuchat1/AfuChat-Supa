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
const CITIES_API = "https://countriesnow.space/api/v0.1/countries/cities";

interface Props {
  value: string;
  onChange: (v: string) => void;
  country: string;
  placeholder?: string;
}

export default function RegionPickerInput({ value, onChange, country, placeholder }: Props) {
  const { colors } = useTheme();
  const [allCities, setAllCities] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const prevCountry = useRef("");
  const searchRef = useRef<TextInput>(null);

  // Fetch all cities whenever country changes
  useEffect(() => {
    if (!country || country === prevCountry.current) return;
    prevCountry.current = country;
    setAllCities([]);
    setFiltered([]);
    fetchCities(country);
  }, [country]);

  async function fetchCities(c: string) {
    if (!c.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(CITIES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: c.trim() }),
      });
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      const cities: string[] = (json?.data ?? []).sort((a: string, b: string) =>
        a.localeCompare(b)
      );
      setAllCities(cities);
      setFiltered(cities);
    } catch {
      setAllCities([]);
      setFiltered([]);
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setSearchQuery("");
    setFiltered(allCities);
    setModalOpen(true);
    setTimeout(() => searchRef.current?.focus(), 300);
  }

  function handleSearch(text: string) {
    setSearchQuery(text);
    if (!text.trim()) {
      setFiltered(allCities);
      return;
    }
    const q = text.toLowerCase();
    setFiltered(allCities.filter((c) => c.toLowerCase().includes(q)));
  }

  function handleSelect(city: string) {
    onChange(city);
    setModalOpen(false);
  }

  function handleClearValue() {
    onChange("");
  }

  const hasValue = value.length > 0;
  const noCountry = !country;

  return (
    <View style={styles.wrapper}>
      {/* Trigger button */}
      <Pressable
        style={[
          styles.trigger,
          { backgroundColor: colors.surface },
        ]}
        onPress={openModal}
        disabled={noCountry && !loading}
      >
        <Ionicons
          name="location-outline"
          size={18}
          color={hasValue ? BRAND : colors.textMuted}
          style={{ marginRight: 10 }}
        />
        <Text
          style={[styles.triggerText, { color: hasValue ? colors.text : colors.textMuted }]}
          numberOfLines={1}
        >
          {noCountry
            ? "Waiting for country detection…"
            : loading
            ? `Loading cities in ${country}…`
            : hasValue
            ? value
            : (placeholder ?? "Select your city or town")}
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

      {/* Hint line */}
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {noCountry
          ? "Country will be detected automatically"
          : loading
          ? `Loading cities in ${country}…`
          : allCities.length > 0
          ? `${allCities.length} cities in ${country} — tap to browse`
          : `No cities found for ${country}`}
      </Text>

      {/* Full-screen modal picker */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOpen(false)}
      >
        <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select City / Town</Text>
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
              placeholder="Search by city name…"
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

          {/* Count label */}
          <Text style={[styles.countText, { color: colors.textMuted }]}>
            {filtered.length === allCities.length
              ? `${allCities.length} cities`
              : `${filtered.length} of ${allCities.length} cities`}
            {country ? ` in ${country}` : ""}
          </Text>

          {/* City list */}
          {loading ? (
            <View style={styles.centeredWrap}>
              <ActivityIndicator size="large" color={BRAND} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Loading cities in {country}…
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.centeredWrap}>
              <Ionicons name="location-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {searchQuery ? "No matching cities found" : "No cities available"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item, i) => `${item}-${i}`}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              initialNumToRender={25}
              maxToRenderPerBatch={40}
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
                    <Ionicons name="location" size={18} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {item}
                  </Text>
                  {value === item && (
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
    gap: 12,
  },
  resultIcon: { width: 24, alignItems: "center" },
  resultName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  centeredWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
});
