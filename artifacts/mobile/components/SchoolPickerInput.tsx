import React, { useCallback, useEffect, useRef, useState } from "react";
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
const API_BASE = "https://universities.hipolabs.com/search";
const MAX_RESULTS = 8;
const DEBOUNCE_MS = 400;

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
  const { colors } = useTheme();
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const search = useCallback(async (q: string, c?: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      let url = `${API_BASE}?name=${encodeURIComponent(q.trim())}`;
      if (c && c.trim()) url += `&country=${encodeURIComponent(c.trim())}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const data: SchoolResult[] = await res.json();
      setResults(data.slice(0, MAX_RESULTS));
      setOpen(data.length > 0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(text: string) {
    selectedRef.current = false;
    setQuery(text);
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text, country), DEBOUNCE_MS);
  }

  function handleSelect(item: SchoolResult) {
    selectedRef.current = true;
    setQuery(item.name);
    onChange(item.name);
    setOpen(false);
    setResults([]);
  }

  function handleClear() {
    setQuery("");
    onChange("");
    setResults([]);
    setOpen(false);
  }

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: colors.surface, borderColor: query ? BRAND : colors.border },
        ]}
      >
        <Ionicons name="school-outline" size={18} color={query ? BRAND : colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.textInput, { color: colors.text }]}
          placeholder={placeholder ?? "Search your school or university"}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={handleChange}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
        />
        {loading && <ActivityIndicator size="small" color={BRAND} style={{ marginLeft: 6 }} />}
        {!loading && query.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {open && results.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={results.length > 4}
            style={{ maxHeight: 220 }}
            ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: colors.border + "44" }]}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.resultTextWrap}>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.resultCountry, { color: colors.textMuted }]}>
                    {item.country}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </Pressable>
            )}
          />
        </View>
      )}

      {country && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Showing results for {country}
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
  textInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
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
  resultTextWrap: { flex: 1, marginRight: 8 },
  resultName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  resultCountry: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 5, marginLeft: 2 },
});
