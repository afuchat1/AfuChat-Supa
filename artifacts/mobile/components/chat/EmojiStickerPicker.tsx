/**
 * EmojiStickerPicker
 * Emoji | GIFs | Stickers in-keyboard picker.
 *
 * Features:
 *  • Emoji & Sticker category bars have a History tab (clock)
 *  • History persists across sessions via AsyncStorage
 *  • GIF tab has debounced search (trending by default, no branding)
 *  • Bottom pill: bold, high-contrast labels that read clearly on any theme
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Image as RNImage,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { emojisByCategory } from "rn-emoji-keyboard";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { GLASS, glassTokens } from "@/constants/glass";
import { AnimatedSearchSurface } from "@/components/chat/AnimatedSearchSurface";

// ─── History helpers ──────────────────────────────────────────────────────────

const EMOJI_HISTORY_KEY   = "@afuchat:emoji_history_v2";
const STICKER_HISTORY_KEY = "@afuchat:sticker_history_v2";
const HISTORY_MAX = 32;

function loadHistory(key: string, set: (v: string[]) => void) {
  AsyncStorage.getItem(key)
    .then((raw) => { try { if (raw) set(JSON.parse(raw)); } catch {} })
    .catch(() => {});
}

function pushHistory(current: string[], item: string, key: string): string[] {
  const next = [item, ...current.filter((x) => x !== item)].slice(0, HISTORY_MAX);
  AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  return next;
}

// ─── Emoji panel ──────────────────────────────────────────────────────────────

const EMOJI_COLS = 8;
const ROW_H      = 38;
const HEADER_H   = 28;

const CAT_ICON_SOURCES: Record<string, any> = {
  recently_used:   require("rn-emoji-keyboard/src/assets/icons/clock.png"),
  smileys_emotion: require("rn-emoji-keyboard/src/assets/icons/smile.png"),
  people_body:     require("rn-emoji-keyboard/src/assets/icons/users.png"),
  animals_nature:  require("rn-emoji-keyboard/src/assets/icons/trees.png"),
  food_drink:      require("rn-emoji-keyboard/src/assets/icons/pizza.png"),
  travel_places:   require("rn-emoji-keyboard/src/assets/icons/plane.png"),
  activities:      require("rn-emoji-keyboard/src/assets/icons/football.png"),
  objects:         require("rn-emoji-keyboard/src/assets/icons/lightbulb.png"),
  symbols:         require("rn-emoji-keyboard/src/assets/icons/ban.png"),
  flags:           require("rn-emoji-keyboard/src/assets/icons/flag.png"),
};

const CAT_LABELS: Record<string, string> = {
  recently_used: "Recently Used", smileys_emotion: "Smileys & Emotion",
  people_body: "People & Body",   animals_nature: "Animals & Nature",
  food_drink: "Food & Drink",     travel_places: "Travel & Places",
  activities: "Activities",       objects: "Objects",
  symbols: "Symbols",             flags: "Flags",
};

type EmojiEntry = { emoji: string; name: string; keywords?: string[] };
type FlatHeader = { kind: "header"; title: string; key: string };
type FlatRow    = { kind: "row"; emojis: EmojiEntry[]; key: string };
type FlatItem   = FlatHeader | FlatRow;

// Build static flat data
const FLAT_ROWS: FlatItem[]    = [];
const SECTION_INDICES: number[]  = [];

for (const cat of emojisByCategory) {
  if (cat.title === "search" || cat.data.length === 0) continue;
  SECTION_INDICES.push(FLAT_ROWS.length);
  FLAT_ROWS.push({ kind: "header", title: cat.title, key: `h:${cat.title}` });
  const data = cat.data as EmojiEntry[];
  for (let i = 0; i < data.length; i += EMOJI_COLS) {
    FLAT_ROWS.push({ kind: "row", emojis: data.slice(i, i + EMOJI_COLS), key: `${cat.title}:${i / EMOJI_COLS}` });
  }
}

const SECTION_TITLES = SECTION_INDICES.map((idx) => (FLAT_ROWS[idx] as FlatHeader).title);

const FLAT_OFFSETS: number[] = [];
let _off = 0;
for (const row of FLAT_ROWS) {
  FLAT_OFFSETS.push(_off);
  _off += row.kind === "header" ? HEADER_H : ROW_H;
}

type EmojiMode = "browse" | "history";

function EmojiScrollPanel({ onEmojiSelected, onScrollDown, onScrollUp, onSelect }: {
  onEmojiSelected: (e: string) => void;
  onScrollDown?: () => void;
  onScrollUp?: () => void;
  onSelect?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const glass = glassTokens(isDark);
  const { accent } = useAppAccent();

  const [mode,           setMode]           = useState<EmojiMode>("browse");
  const [historyItems,   setHistoryItems]   = useState<string[]>([]);
  const [activeCat,      setActiveCat]      = useState(0);

  const listRef       = useRef<FlatList>(null);
  const catBarRef     = useRef<ScrollView>(null);
  const activeCatRef  = useRef(0);
  const isScrollingTo = useRef(false);
  const lastScrollY   = useRef(0);

  useEffect(() => { loadHistory(EMOJI_HISTORY_KEY, setHistoryItems); }, []);

  const handleSelect = useCallback((emoji: string) => {
    onEmojiSelected(emoji);
    onSelect?.();
    setHistoryItems((prev) => pushHistory(prev, emoji, EMOJI_HISTORY_KEY));
  }, [onEmojiSelected, onSelect]);

  const handleScroll = useCallback((e: any) => {
    const y  = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;
    if (dy > 8)  onScrollDown?.();
    else if (dy < -4) onScrollUp?.();
  }, [onScrollDown, onScrollUp]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (isScrollingTo.current || !viewableItems.length || mode !== "browse") return;
    for (const vi of viewableItems) {
      const item: FlatItem = vi.item;
      const title = item.kind === "header" ? item.title : (() => {
        for (let i = vi.index - 1; i >= 0; i--) {
          if (FLAT_ROWS[i].kind === "header") return (FLAT_ROWS[i] as FlatHeader).title;
        }
        return SECTION_TITLES[0];
      })();
      const idx = SECTION_TITLES.indexOf(title);
      if (idx >= 0 && idx !== activeCatRef.current) {
        activeCatRef.current = idx;
        setActiveCat(idx);
        catBarRef.current?.scrollTo({ x: Math.max(0, idx * 44 - 44), animated: true });
      }
      break;
    }
  }).current;

  const scrollToCategory = useCallback((idx: number) => {
    isScrollingTo.current = true;
    activeCatRef.current = idx;
    setActiveCat(idx);
    setMode("browse");
    listRef.current?.scrollToIndex({ index: SECTION_INDICES[idx], animated: true, viewOffset: 0 });
    catBarRef.current?.scrollTo({ x: Math.max(0, idx * 44 - 44), animated: true });
    setTimeout(() => { isScrollingTo.current = false; }, 700);
  }, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: FLAT_ROWS[index]?.kind === "header" ? HEADER_H : ROW_H,
    offset: FLAT_OFFSETS[index] ?? 0,
    index,
  }), []);

  const keyExtractor = useCallback((item: FlatItem) => item.key, []);

  const renderItem = useCallback(({ item }: { item: FlatItem }) => {
    if (item.kind === "header") {
      return (
        <View style={{ height: HEADER_H, justifyContent: "flex-end", paddingHorizontal: 12, paddingBottom: 3, backgroundColor: colors.surface as string }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.textMuted as string, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {CAT_LABELS[item.title] ?? item.title}
          </Text>
        </View>
      );
    }
    return (
      <View style={{ flexDirection: "row", paddingHorizontal: 4, height: ROW_H }}>
        {item.emojis.map((e) => (
          <TouchableOpacity key={e.name} onPress={() => handleSelect(e.emoji)}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }} activeOpacity={0.6}>
            <Text style={{ fontSize: 26 }}>{e.emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [handleSelect, colors]);

  return (
    <View style={{ flex: 1 }}>
      <BlurView intensity={GLASS.blur.medium} tint={isDark ? "dark" : "light"}
          style={{ height: 44, borderBottomWidth: 0.5, borderBottomColor: glass.border }}>
          <ScrollView ref={catBarRef} horizontal showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 4, alignItems: "center", height: 44 }}>
            <TouchableOpacity onPress={() => setMode("history")}
              style={[ep.catBtn, { borderBottomWidth: mode === "history" ? 2 : 0, borderBottomColor: accent }]}
              activeOpacity={0.7}>
              <Ionicons name="time-outline" size={20} color={mode === "history" ? accent : (colors.textMuted as string)} />
            </TouchableOpacity>
            {SECTION_TITLES.map((title, i) => {
              const isActive = mode === "browse" && i === activeCat;
              return (
                <TouchableOpacity key={title} onPress={() => scrollToCategory(i)}
                  style={[ep.catBtn, { borderBottomWidth: isActive ? 2 : 0, borderBottomColor: accent }]}
                  activeOpacity={0.7}>
                  <Image source={CAT_ICON_SOURCES[title]} style={{ width: 20, height: 20 }}
                    tintColor={isActive ? accent : (colors.textMuted as string)} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </BlurView>

      {mode === "history" && (
        historyItems.length === 0 ? (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 56 }}
            onScroll={handleScroll} scrollEventThrottle={16}>
            <View style={{ alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 40 }}>
              <Ionicons name="time-outline" size={36} color={colors.textMuted as string} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.textMuted as string }}>
                No history yet
              </Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 56 }}
            onScroll={handleScroll} scrollEventThrottle={16}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
              {historyItems.map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => handleSelect(emoji)}
                  style={{ width: `${100 / EMOJI_COLS}%`, alignItems: "center", justifyContent: "center", height: ROW_H }}
                  activeOpacity={0.6}>
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )
      )}

      {mode === "browse" && (
        <FlatList
          ref={listRef}
          data={FLAT_ROWS}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={false}
          contentContainerStyle={{ paddingBottom: 56 }}
          style={{ flex: 1 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      )}
    </View>
  );
}

const ep = StyleSheet.create({
  catBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});

// ─── Sticker data ─────────────────────────────────────────────────────────────

const STICKER_COLS  = 6;
const STICKER_ROW_H = 56;
const STICKER_HDR_H = 28;

const STICKER_CATEGORIES: { label: string; ionicon: string; stickers: string[] }[] = [
  { label: "Hot",      ionicon: "flame-outline",           stickers: ["😂","🥰","😍","😎","🤩","🥺","😭","🤣","😅","😇","🫶","👏","🙌","🤝","💪","✌️","🤙","👋","🙏","💯"] },
  { label: "Smiles",   ionicon: "happy-outline",            stickers: ["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","🥰","😘","😗","😙","😚","🙂","🤗","🤩","😲","😮","😯","😦","😧","😤","😠","😡","😈"] },
  { label: "Gestures", ionicon: "hand-left-outline",        stickers: ["👍","👎","✌️","🤞","🤟","🤘","🤙","🖕","☝️","👆","👇","👈","👉","🫵","✋","🖐️","👋","🤚","🙌","👐","🤲","👏","🫶","🤝","🙏","✍️","💪","🦵","🦶","🖖"] },
  { label: "Hearts",   ionicon: "heart-outline",            stickers: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟","♥️","🫀","💌","💋","😻","🥰","😍","😘","😗","💑"] },
  { label: "Animals",  ionicon: "paw-outline",              stickers: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦄","🐴","🦋","🐝","🐛","🐞","🦊","🦝","🦔","🐺","🦉","🦅"] },
  { label: "Food",     ionicon: "fast-food-outline",        stickers: ["🍕","🍔","🌮","🍟","🍿","🧁","🎂","🍰","🍩","🍪","🍦","🍧","🍨","🍫","🍬","🍭","☕","🧋","🍺","🥂","🍓","🍒","🍇","🍉","🍊","🍋","🍑","🥝","🍍","🥭"] },
  { label: "Fun",      ionicon: "game-controller-outline",  stickers: ["🎉","🎊","🎈","🎁","🎀","🎮","🕹️","🎯","🎲","🃏","🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎟️","🎫","🎪","🔥","💫","⭐","🌟","💥","🎆","🎇","🧨","🎑"] },
  { label: "Nature",   ionicon: "leaf-outline",             stickers: ["🌸","🌺","🌻","🌹","🌷","🌼","💐","🌱","🌿","🍀","🍁","🍂","🍃","🌳","🌴","🌵","🎋","🎍","🌾","🌊","🌈","⚡","🌪️","🌤️","⛅","🌧️","🌙","⭐","☀️","🌞"] },
];

type StickerHeader = { kind: "header"; label: string; key: string };
type StickerRow    = { kind: "row"; stickers: string[]; key: string };
type StickerItem   = StickerHeader | StickerRow;

const STICKER_FLAT: StickerItem[] = [];
const STICKER_SEC_INDICES: number[] = [];

for (const cat of STICKER_CATEGORIES) {
  STICKER_SEC_INDICES.push(STICKER_FLAT.length);
  STICKER_FLAT.push({ kind: "header", label: cat.label, key: `sh:${cat.label}` });
  for (let i = 0; i < cat.stickers.length; i += STICKER_COLS) {
    STICKER_FLAT.push({ kind: "row", stickers: cat.stickers.slice(i, i + STICKER_COLS), key: `${cat.label}:${i}` });
  }
}

const STICKER_OFFSETS: number[] = [];
let _soff = 0;
for (const row of STICKER_FLAT) {
  STICKER_OFFSETS.push(_soff);
  _soff += row.kind === "header" ? STICKER_HDR_H : STICKER_ROW_H;
}

type StickerMode = "browse" | "history";

function StickerScrollPanel({ onSendSticker, onScrollDown, onScrollUp, onSelect }: {
  onSendSticker: (s: string) => void;
  onScrollDown?: () => void;
  onScrollUp?: () => void;
  onSelect?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const glass = glassTokens(isDark);
  const { accent } = useAppAccent();

  const [mode,         setMode]         = useState<StickerMode>("browse");
  const [historyItems, setHistoryItems] = useState<string[]>([]);
  const [activeCat,    setActiveCat]    = useState(0);

  const listRef       = useRef<FlatList>(null);
  const catBarRef     = useRef<ScrollView>(null);
  const activeCatRef  = useRef(0);
  const isScrollingTo = useRef(false);
  const lastScrollY   = useRef(0);

  useEffect(() => { loadHistory(STICKER_HISTORY_KEY, setHistoryItems); }, []);

  const handleSend = useCallback((sticker: string) => {
    onSendSticker(sticker);
    onSelect?.();
    setHistoryItems((prev) => pushHistory(prev, sticker, STICKER_HISTORY_KEY));
  }, [onSendSticker, onSelect]);

  const handleScroll = useCallback((e: any) => {
    const y  = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;
    if (dy > 8)  onScrollDown?.();
    else if (dy < -4) onScrollUp?.();
  }, [onScrollDown, onScrollUp]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (isScrollingTo.current || !viewableItems.length || mode !== "browse") return;
    for (const vi of viewableItems) {
      const item: StickerItem = vi.item;
      const label = item.kind === "header" ? item.label : (() => {
        for (let i = vi.index - 1; i >= 0; i--) {
          if (STICKER_FLAT[i].kind === "header") return (STICKER_FLAT[i] as StickerHeader).label;
        }
        return STICKER_CATEGORIES[0].label;
      })();
      const idx = STICKER_CATEGORIES.findIndex((c) => c.label === label);
      if (idx >= 0 && idx !== activeCatRef.current) {
        activeCatRef.current = idx;
        setActiveCat(idx);
        catBarRef.current?.scrollTo({ x: Math.max(0, idx * 44 - 44), animated: true });
      }
      break;
    }
  }).current;

  const scrollToCategory = useCallback((idx: number) => {
    isScrollingTo.current = true;
    activeCatRef.current = idx;
    setActiveCat(idx);
    setMode("browse");
    listRef.current?.scrollToIndex({ index: STICKER_SEC_INDICES[idx], animated: true, viewOffset: 0 });
    catBarRef.current?.scrollTo({ x: Math.max(0, idx * 44 - 44), animated: true });
    setTimeout(() => { isScrollingTo.current = false; }, 700);
  }, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: STICKER_FLAT[index]?.kind === "header" ? STICKER_HDR_H : STICKER_ROW_H,
    offset: STICKER_OFFSETS[index] ?? 0,
    index,
  }), []);

  const keyExtractor = useCallback((item: StickerItem) => item.key, []);

  const renderItem = useCallback(({ item }: { item: StickerItem }) => {
    if (item.kind === "header") {
      return (
        <View style={{ height: STICKER_HDR_H, justifyContent: "flex-end", paddingHorizontal: 12, paddingBottom: 3, backgroundColor: colors.surface as string }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.textMuted as string, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {item.label}
          </Text>
        </View>
      );
    }
    return (
      <View style={{ flexDirection: "row", height: STICKER_ROW_H }}>
        {item.stickers.map((emoji, i) => (
          <TouchableOpacity key={i} onPress={() => handleSend(emoji)}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }} activeOpacity={0.6}>
            <Text style={{ fontSize: 32 }}>{emoji}</Text>
          </TouchableOpacity>
        ))}
        {item.stickers.length < STICKER_COLS &&
          Array.from({ length: STICKER_COLS - item.stickers.length }).map((_, i) => (
            <View key={`pad-${i}`} style={{ flex: 1 }} />
          ))}
      </View>
    );
  }, [handleSend, colors]);

  const StickerGrid = useCallback(({ stickers, headerComponent }: { stickers: string[]; headerComponent?: React.ReactNode }) => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 56 }}
      onScroll={handleScroll} scrollEventThrottle={16}>
      {headerComponent}
      <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
        {stickers.map((s, i) => (
          <TouchableOpacity key={`${s}-${i}`} onPress={() => handleSend(s)}
            style={{ width: `${100 / STICKER_COLS}%`, alignItems: "center", justifyContent: "center", height: STICKER_ROW_H }}
            activeOpacity={0.6}>
            <Text style={{ fontSize: 32 }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  ), [handleSend, handleScroll]);

  return (
    <View style={{ flex: 1 }}>
      <BlurView intensity={GLASS.blur.medium} tint={isDark ? "dark" : "light"}
          style={{ height: 44, borderBottomWidth: 0.5, borderBottomColor: glass.border }}>
          <ScrollView ref={catBarRef} horizontal showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 4, alignItems: "center", height: 44 }}>
            <TouchableOpacity onPress={() => setMode("history")}
              style={[ep.catBtn, { borderBottomWidth: mode === "history" ? 2 : 0, borderBottomColor: accent }]}
              activeOpacity={0.7}>
              <Ionicons name="time-outline" size={20} color={mode === "history" ? accent : (colors.textMuted as string)} />
            </TouchableOpacity>
            {STICKER_CATEGORIES.map((cat, i) => {
              const isActive = mode === "browse" && i === activeCat;
              return (
                <TouchableOpacity key={cat.label} onPress={() => scrollToCategory(i)}
                  style={[ep.catBtn, { borderBottomWidth: isActive ? 2 : 0, borderBottomColor: accent }]}
                  activeOpacity={0.7}>
                  <Ionicons name={cat.ionicon as any} size={20}
                    color={isActive ? accent : (colors.textMuted as string)} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </BlurView>

      {mode === "history" && (
        historyItems.length === 0 ? (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 56 }}
            onScroll={handleScroll} scrollEventThrottle={16}>
            <View style={{ alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 40 }}>
              <Ionicons name="time-outline" size={36} color={colors.textMuted as string} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.textMuted as string }}>
                No history yet
              </Text>
            </View>
          </ScrollView>
        ) : (
          <StickerGrid stickers={historyItems} />
        )
      )}

      {mode === "browse" && (
        <FlatList
          ref={listRef}
          data={STICKER_FLAT}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
          maxToRenderPerBatch={10}
          windowSize={10}
           removeClippedSubviews={false}
          contentContainerStyle={{ paddingBottom: 56 }}
          style={{ flex: 1 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      )}
    </View>
  );
}

// ─── GIF panel ────────────────────────────────────────────────────────────────

type GifItem = { id: string; preview: string; url: string };

async function fetchGifs(query: string, apiKey: string): Promise<GifItem[]> {
  const endpoint = query.trim()
    ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query.trim())}&limit=24&rating=g`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=24&rating=g`;
  const res  = await fetch(endpoint);
  const json = await res.json();
  return (json.data ?? [])
    .map((r: any) => ({
      id:      r.id as string,
      preview: (r.images?.fixed_height_small?.url ?? r.images?.downsized_small?.url ?? "") as string,
      url:     (r.images?.downsized?.url ?? r.images?.fixed_height?.url ?? "") as string,
    }))
    .filter((g: GifItem) => g.url);
}

function GifPanel({ onSendGif, onScrollDown, onScrollUp, onSelect }: {
  onSendGif: (url: string) => void;
  onScrollDown?: () => void;
  onScrollUp?: () => void;
  onSelect?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { accent } = useAppAccent();
  const glass = glassTokens(isDark);

  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiKeyRef   = useRef<string>("");
  const lastScrollY = useRef(0);

  const handleScroll = useCallback((e: any) => {
    const y  = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;
    if (dy > 8)  onScrollDown?.();
    else if (dy < -4) onScrollUp?.();
  }, [onScrollDown, onScrollUp]);

  useEffect(() => {
    import("@/lib/env").then(({ GIPHY_API_KEY }) => {
      apiKeyRef.current = GIPHY_API_KEY ?? "";
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    import("@/lib/env").then(({ GIPHY_API_KEY }) => fetchGifs("", GIPHY_API_KEY ?? ""))
      .then((items) => { if (!cancelled) { setResults(items); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const onChangeQuery = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try { setResults(await fetchGifs(text, apiKeyRef.current)); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 400);
  }, []);

  const left  = results.filter((_, i) => i % 2 === 0);
  const right = results.filter((_, i) => i % 2 !== 0);

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar — no branding */}
      <AnimatedSearchSurface>
      <View style={[s.gifSearchRow, { borderBottomColor: glass.border }]}>
        <View style={[s.gifSearchBox, {
          backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)",
          borderColor: glass.border,
        }]}>
          <Ionicons name="search" size={14} color={colors.textMuted as string} style={{ marginRight: 6 }} />
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder="Search GIFs…"
            placeholderTextColor={colors.textMuted as string}
            style={[s.gifSearchInput, { color: colors.text as string }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => onChangeQuery("")} hitSlop={8} activeOpacity={0.6}>
              <Ionicons name="close-circle" size={15} color={colors.textMuted as string} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      </AnimatedSearchSurface>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={accent} />
        </View>
      ) : results.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Text style={{ fontSize: 32 }}>🎞️</Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.textMuted as string }}>
            {query.trim() ? `No GIFs for "${query}"` : "Loading trending GIFs…"}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 6, paddingTop: 4, paddingBottom: 56 }}
          onScroll={handleScroll} scrollEventThrottle={16}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {[left, right].map((col, ci) => (
              <View key={ci} style={{ flex: 1, gap: 4 }}>
                {col.map((gif) => (
                  <TouchableOpacity key={gif.id} activeOpacity={0.75}
                    onPress={() => { onSendGif(gif.url); onSelect?.(); }}
                    style={{ borderRadius: 8, overflow: "hidden", backgroundColor: colors.inputBg as string }}>
                    <Image source={{ uri: gif.preview }} style={{ width: "100%", aspectRatio: 1.4 }} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "emoji" | "gifs" | "stickers";

interface Props {
  height: number;
  onEmojiSelected: (emoji: string) => void;
  onSendSticker: (emoji: string) => void;
  onSendGif?: (url: string) => void;
  onDelete?: () => void;
  onClose?: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmojiStickerPicker({
  height,
  onEmojiSelected,
  onSendSticker,
  onSendGif,
  onDelete,
}: Props) {
  const { colors, isDark } = useTheme();
  const { accent } = useAppAccent();
  const glass = glassTokens(isDark);

  const [tab, setTab] = useState<Tab>("emoji");

  const BOTTOM_GAP = 10;

  // ── Bar show / hide animation ───────────────────────────────────────────────
  // barAnim: 0 = fully visible, 1 = hidden below
  const barAnim = useRef(new Animated.Value(0)).current;

  const showBar = useCallback(() => {
    Animated.spring(barAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 16,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [barAnim]);

  const hideBar = useCallback(() => {
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [barAnim]);

  const handleTabPress = useCallback((t: Tab) => {
    setTab(t);
    showBar();
  }, [showBar]);

  const pillTranslateY = barAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 70] });
  const pillOpacity    = barAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={[s.root, { height, backgroundColor: colors.surface as string }]}>

      {/* Content area — full height, pill floats above */}
      <View style={{ flex: 1 }}>
        {tab === "emoji"    && (
          <EmojiScrollPanel
            onEmojiSelected={onEmojiSelected}
            onScrollDown={hideBar}
            onScrollUp={showBar}
            onSelect={showBar}
          />
        )}
        {tab === "gifs"     && (
          <GifPanel
            onSendGif={onSendGif ?? (() => {})}
            onScrollDown={hideBar}
            onScrollUp={showBar}
            onSelect={showBar}
          />
        )}
        {tab === "stickers" && (
          <StickerScrollPanel
            onSendSticker={onSendSticker}
            onScrollDown={hideBar}
            onScrollUp={showBar}
            onSelect={showBar}
          />
        )}
      </View>

      {/* ── Floating pill row — animated ── */}
      <Animated.View
        style={[
          s.pillRow,
          { bottom: BOTTOM_GAP, transform: [{ translateY: pillTranslateY }], opacity: pillOpacity },
        ]}
      >
        {/* Tab pill */}
        <BlurView intensity={isDark ? 60 : 80} tint={isDark ? "dark" : "light"}
          style={[s.pill, { borderColor: glass.border }, GLASS.shadow.darkSoft as any]}>
          <View style={[StyleSheet.absoluteFill, {
            backgroundColor: isDark ? "rgba(30,30,35,0.85)" : "rgba(255,255,255,0.90)",
            borderRadius: GLASS.radius.pill,
          }]} />
          {(["emoji", "gifs", "stickers"] as Tab[]).map((t) => {
            const active = tab === t;
            const label  = t === "emoji" ? "Emoji" : t === "gifs" ? "GIFs" : "Stickers";
            return (
              <TouchableOpacity key={t} onPress={() => handleTabPress(t)} activeOpacity={0.7} style={s.pillTab}>
                {active && <View style={[s.activeChip, { backgroundColor: accent + "25" }]} />}
                <Text style={[
                  s.pillLabel,
                  {
                    color: active ? accent : (isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)"),
                    fontFamily: active ? "Inter_700Bold" : "Inter_600SemiBold",
                  },
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </BlurView>

        {/* ⌫ circle */}
        <BlurView intensity={isDark ? 60 : 80} tint={isDark ? "dark" : "light"}
          style={[s.deleteCircle, { borderColor: glass.border }, GLASS.shadow.darkSoft as any]}>
          <View style={[StyleSheet.absoluteFill, {
            backgroundColor: isDark ? "rgba(30,30,35,0.85)" : "rgba(255,255,255,0.90)",
            borderRadius: 20,
          }]} />
          <TouchableOpacity onPress={() => { onDelete?.(); showBar(); }} activeOpacity={0.6} hitSlop={8} style={s.deleteInner}>
            <Ionicons name="backspace-outline" size={20}
              color={isDark ? "rgba(255,255,255,0.70)" : "rgba(0,0,0,0.55)"} />
          </TouchableOpacity>
        </BlurView>

      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { overflow: "hidden", flexDirection: "column" },

  gifSearchRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
  },

  gifSearchBox: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 0.5,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  gifSearchInput: {
    flex: 1,
    minHeight: 32,
    paddingVertical: 0,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  pillRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    pointerEvents: "box-none" as any,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: GLASS.radius.pill,
    borderWidth: 0.5,
    overflow: "hidden",
    paddingHorizontal: 4,
  },

  pillTab: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    height: 40,
  },

  activeChip: {
    ...StyleSheet.absoluteFill,
    borderRadius: GLASS.radius.pill,
    marginHorizontal: 4,
    marginVertical: 6,
  },

  pillLabel: {
    fontSize: 13.5,
    letterSpacing: 0.1,
  },

  deleteCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 0.5,
    overflow: "hidden",
  },

  deleteInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
