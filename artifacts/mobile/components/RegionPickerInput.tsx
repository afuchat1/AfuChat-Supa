import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

const BRAND = "#FF2D55";
const CITIES_API = "https://countriesnow.space/api/v0.1/countries/cities";
const MAX_SHOWN = 8;

interface Props {
  value: string;
  onChange: (v: string) => void;
  country: string;
  placeholder?: string;
}

export default function RegionPickerInput({ value, onChange, country, placeholder }: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState(value);
  const [allCities, setAllCities] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const prevCountry = useRef("");

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!country || country === prevCountry.current) return;
    prevCountry.current = country;
    setAllCities([]);
    setFiltered([]);
    setOpen(false);
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
      if (!res.ok) throw new Error("cities fetch failed");
      const json = await res.json();
      const cities: string[] = json?.data ?? [];
      setAllCities(cities.sort());
    } catch {
      setAllCities([]);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(text: string) {
    setQuery(text);
    onChange(text);
    if (text.trim().length === 0) {
      setFiltered([]);
      setOpen(false);
      return;
    }
    const q = text.toLowerCase();
    const matches = allCities.filter((c) => c.toLowerCase().includes(q));
    setFiltered(matches.slice(0, MAX_SHOWN));
    setOpen(matches.length > 0);
  }

  function handleSelect(city: string) {
    setQuery(city);
    onChange(city);
    setOpen(false);
    setFiltered([]);
  }

  function handleClear() {
    setQuery("");
    onChange("");
    setFiltered([]);
    setOpen(false);
  }

  const isEmpty = allCities.length === 0 && !loading;
  const noCountry = !country;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: colors.surface, borderColor: query ? BRAND : colors.border },
        ]}
      >
        <Ionicons
          name="location-outline"
          size={18}
          color={query ? BRAND : colors.textMuted}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={[styles.textInput, { color: colors.text }]}
          placeholder={
            noCountry
              ? "Detecting your country…"
              : loading
              ? `Loading cities in ${country}…`
              : placeholder ?? "Search your city or town"
          }
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={handleChange}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => {
            if (filtered.length > 0) setOpen(true);
          }}
          editable={!noCountry}
        />
        {loading && (
          <ActivityIndicator size="small" color={BRAND} style={{ marginLeft: 6 }} />
        )}
        {!loading && query.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {open && filtered.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FlatList
            data={filtered}
            keyExtractor={(item, i) => `${item}-${i}`}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={filtered.length > 4}
            style={{ maxHeight: 220 }}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            )}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.resultRow,
                  pressed && { backgroundColor: colors.border + "44" },
                ]}
                onPress={() => handleSelect(item)}
              >
                <Ionicons name="location" size={14} color={BRAND} style={{ marginRight: 10 }} />
                <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                  {item}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </Pressable>
            )}
          />
        </View>
      )}

      {!noCountry && !loading && isEmpty && query.length > 1 && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          No cities found — you can type your city manually.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative", zIndex: 100 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  dropdown: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  hint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 5,
    marginLeft: 2,
  },
});
