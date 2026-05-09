import React, { useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/hooks/useTheme";

const CATEGORIES: { label: string; icon: string; stickers: string[] }[] = [
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

interface Props {
  onSendSticker: (emoji: string) => void;
}

export default function StickerPicker({ onSendSticker }: Props) {
  const { colors } = useTheme();
  const [activeCategory, setActiveCategory] = useState(0);

  const current = CATEGORIES[activeCategory];

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.categoryBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.categoryBarContent}
      >
        {CATEGORIES.map((cat, i) => (
          <TouchableOpacity
            key={cat.label}
            onPress={() => setActiveCategory(i)}
            style={[
              styles.categoryBtn,
              i === activeCategory && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
            ]}
            activeOpacity={0.7}
          >
            <Text style={styles.categoryIcon}>{cat.icon}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        key={activeCategory}
        data={current.stickers}
        numColumns={6}
        keyExtractor={(item, i) => `${activeCategory}-${i}-${item}`}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  categoryBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 44,
  },
  categoryBarContent: {
    paddingHorizontal: 8,
    alignItems: "center",
  },
  categoryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryIcon: {
    fontSize: 22,
  },
  grid: {
    padding: 8,
  },
  stickerBtn: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  stickerEmoji: {
    fontSize: 34,
  },
});
