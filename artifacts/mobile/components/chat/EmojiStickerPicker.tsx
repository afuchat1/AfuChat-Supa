import React, { useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { EmojiKeyboard } from "rn-emoji-keyboard";
import { useTheme } from "@/hooks/useTheme";

const BRAND = "#00BCD4";

const STICKER_CATEGORIES: { label: string; icon: string; stickers: string[] }[] = [
  {
    label: "Hot",
    icon: "🔥",
    stickers: [
      "😂","🥰","😍","😎","🤩","🥺","😭","🤣","😅","😇",
      "🫶","👏","🙌","🤝","💪","✌️","🤙","👋","🙏","💯",
    ],
  },
  {
    label: "Smiles",
    icon: "😊",
    stickers: [
      "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊",
      "😋","😎","😍","🥰","😘","😗","😙","😚","🙂","🤗",
      "🤩","😲","😮","😯","😦","😧","😤","😠","😡","😈",
    ],
  },
  {
    label: "Gestures",
    icon: "👍",
    stickers: [
      "👍","👎","✌️","🤞","🤟","🤘","🤙","🖕","☝️","👆",
      "👇","👈","👉","🫵","✋","🖐️","👋","🤚","🙌","👐",
      "🤲","👏","🫶","🤝","🙏","✍️","💪","🦵","🦶","🖖",
    ],
  },
  {
    label: "Hearts",
    icon: "❤️",
    stickers: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟",
      "♥️","🫀","💌","💋","😻","🥰","😍","😘","😗","💑",
    ],
  },
  {
    label: "Animals",
    icon: "🐶",
    stickers: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
      "🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦄","🐴",
      "🦋","🐝","🐛","🐞","🦊","🦝","🦔","🐺","🦉","🦅",
    ],
  },
  {
    label: "Food",
    icon: "🍕",
    stickers: [
      "🍕","🍔","🌮","🍟","🍿","🧁","🎂","🍰","🍩","🍪",
      "🍦","🍧","🍨","🍫","🍬","🍭","☕","🧋","🍺","🥂",
      "🍓","🍒","🍇","🍉","🍊","🍋","🍑","🥝","🍍","🥭",
    ],
  },
  {
    label: "Fun",
    icon: "🎉",
    stickers: [
      "🎉","🎊","🎈","🎁","🎀","🎮","🕹️","🎯","🎲","🃏",
      "🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎟️","🎫","🎪",
      "🔥","💫","⭐","🌟","✨","💥","🎆","🎇","🧨","🎑",
    ],
  },
  {
    label: "Nature",
    icon: "🌸",
    stickers: [
      "🌸","🌺","🌻","🌹","🌷","🌼","💐","🌱","🌿","🍀",
      "🍁","🍂","🍃","🌳","🌴","🌵","🎋","🎍","🌾","🌊",
      "🌈","⚡","🌪️","🌤️","⛅","🌧️","🌙","⭐","☀️","🌞",
    ],
  },
];

type Tab = "emoji" | "stickers";

interface Props {
  height: number;
  onEmojiSelected: (emoji: string) => void;
  onSendSticker: (emoji: string) => void;
  onClose?: () => void;
}

export default function EmojiStickerPicker({ height, onEmojiSelected, onSendSticker, onClose }: Props) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("emoji");
  const [activeCat, setActiveCat] = useState(0);

  const emojiTheme = {
    knob: colors.textMuted,
    container: colors.surface,
    header: colors.text,
    skinTonesContainer: colors.surface,
    category: {
      icon: colors.textMuted,
      iconActive: BRAND,
      container: colors.surface,
      containerActive: colors.inputBg,
    },
    search: {
      text: colors.text,
      placeholder: colors.textMuted,
      icon: colors.textMuted,
      background: colors.inputBg,
    },
    emoji: { selected: colors.inputBg },
  };

  return (
    <View style={[styles.root, { height, backgroundColor: colors.surface }]}>
      {/* ── Tab bar ── */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.tab, tab === "emoji" && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
          onPress={() => setTab("emoji")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabLabel, { color: tab === "emoji" ? BRAND : colors.textMuted }]}>
            😊 Emoji
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "stickers" && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
          onPress={() => setTab("stickers")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabLabel, { color: tab === "stickers" ? BRAND : colors.textMuted }]}>
            🎨 Stickers
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Emoji panel ── */}
      {tab === "emoji" && (
        <View style={styles.emojiPanel}>
          <EmojiKeyboard
            onEmojiSelected={(emojiObject: { emoji: string }) => onEmojiSelected(emojiObject.emoji)}
            enableRecentlyUsed
            enableSearchBar
            enableCategoryChangeGesture={false}
            categoryPosition="top"
            disableSafeArea
            expandable={false}
            theme={emojiTheme}
            styles={{ container: { flex: 1, borderRadius: 0, shadowOpacity: 0, elevation: 0 } }}
          />
        </View>
      )}

      {/* ── Stickers panel ── */}
      {tab === "stickers" && (
        <View style={styles.stickerPanel}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.catBar, { borderBottomColor: colors.border }]}
            contentContainerStyle={styles.catBarContent}
          >
            {STICKER_CATEGORIES.map((cat, i) => (
              <TouchableOpacity
                key={cat.label}
                onPress={() => setActiveCat(i)}
                style={[
                  styles.catBtn,
                  i === activeCat && { borderBottomColor: BRAND, borderBottomWidth: 2 },
                ]}
                activeOpacity={0.7}
              >
                <Text style={styles.catIcon}>{cat.icon}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            key={activeCat}
            data={STICKER_CATEGORIES[activeCat].stickers}
            numColumns={6}
            keyExtractor={(item, i) => `${activeCat}-${i}-${item}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSendSticker(item)}
                style={styles.stickerBtn}
                activeOpacity={0.6}
              >
                <Text style={styles.stickerEmoji}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden" },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 42,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 2,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  emojiPanel: {
    flex: 1,
  },

  stickerPanel: { flex: 1 },
  catBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 44,
  },
  catBarContent: {
    paddingHorizontal: 8,
    alignItems: "center",
  },
  catBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  catIcon: { fontSize: 22 },

  grid: { padding: 8 },
  stickerBtn: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  stickerEmoji: { fontSize: 34 },
});
