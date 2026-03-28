import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";

function useStoreCardWidth() {
  const { width } = useWindowDimensions();
  return (width - 48 - 12) / 2;
}

type StoreItem = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  price: number;
  currency: "acoin" | "premium";
  preview?: string;
  colors: [string, string];
  isNew?: boolean;
  isHot?: boolean;
};

const STORE_ITEMS: StoreItem[] = [
  {
    id: "frame_gold",
    name: "Gold Frame",
    description: "Luxurious golden ring around your avatar",
    emoji: "⭕",
    category: "Frames",
    rarity: "rare",
    price: 200,
    currency: "acoin",
    colors: ["#D4A853", "#B8860B"],
    isHot: true,
  },
  {
    id: "frame_diamond",
    name: "Diamond Frame",
    description: "Shimmering crystalline avatar ring",
    emoji: "💎",
    category: "Frames",
    rarity: "legendary",
    price: 1000,
    currency: "acoin",
    colors: ["#B9F2FF", "#4FC3F7"],
    isNew: true,
  },
  {
    id: "frame_fire",
    name: "Fire Frame",
    description: "Blazing flames surround your avatar",
    emoji: "🔥",
    category: "Frames",
    rarity: "epic",
    price: 500,
    currency: "acoin",
    colors: ["#FF6B6B", "#FF1744"],
  },
  {
    id: "frame_galaxy",
    name: "Galaxy Frame",
    description: "A cosmic nebula ring",
    emoji: "🌌",
    category: "Frames",
    rarity: "legendary",
    price: 1500,
    currency: "acoin",
    colors: ["#AF52DE", "#7B00D4"],
    isNew: true,
  },
  {
    id: "theme_night",
    name: "Night City",
    description: "Deep dark cyberpunk chat theme",
    emoji: "🌃",
    category: "Themes",
    rarity: "rare",
    price: 300,
    currency: "acoin",
    colors: ["#0D1117", "#1E3A5F"],
  },
  {
    id: "theme_sakura",
    name: "Sakura Spring",
    description: "Gentle pink blossoms chat theme",
    emoji: "🌸",
    category: "Themes",
    rarity: "rare",
    price: 300,
    currency: "acoin",
    colors: ["#FF8FAB", "#FF2D78"],
    isHot: true,
  },
  {
    id: "theme_ocean",
    name: "Deep Ocean",
    description: "Serene aquatic depths theme",
    emoji: "🌊",
    category: "Themes",
    rarity: "common",
    price: 150,
    currency: "acoin",
    colors: ["#006994", "#4ECDC4"],
  },
  {
    id: "theme_sunset",
    name: "Golden Sunset",
    description: "Warm sunset gradients everywhere",
    emoji: "🌅",
    category: "Themes",
    rarity: "epic",
    price: 600,
    currency: "acoin",
    colors: ["#FF9500", "#FF3B30"],
  },
  {
    id: "bubble_neon",
    name: "Neon Bubbles",
    description: "Glowing neon message bubbles",
    emoji: "💬",
    category: "Bubbles",
    rarity: "epic",
    price: 400,
    currency: "acoin",
    colors: ["#4ECDC4", "#007AFF"],
    isHot: true,
  },
  {
    id: "bubble_glass",
    name: "Glass Bubbles",
    description: "Frosted glass message style",
    emoji: "🫧",
    category: "Bubbles",
    rarity: "rare",
    price: 250,
    currency: "acoin",
    colors: ["#B9F2FF", "#636366"],
    isNew: true,
  },
  {
    id: "sticker_cute",
    name: "Cute Pack",
    description: "30 adorable character stickers",
    emoji: "🐱",
    category: "Stickers",
    rarity: "common",
    price: 100,
    currency: "acoin",
    colors: ["#FF8FAB", "#AF52DE"],
  },
  {
    id: "sticker_meme",
    name: "Meme Pack",
    description: "Viral meme sticker collection",
    emoji: "😂",
    category: "Stickers",
    rarity: "common",
    price: 100,
    currency: "acoin",
    colors: ["#FF9500", "#FF3B30"],
    isHot: true,
  },
  {
    id: "emote_wave",
    name: "Wave Emote",
    description: "Animated waving emote",
    emoji: "👋",
    category: "Emotes",
    rarity: "common",
    price: 80,
    currency: "acoin",
    colors: ["#4ECDC4", "#40B5AE"],
  },
  {
    id: "emote_fire",
    name: "Fire Emote",
    description: "Animated fire reaction emote",
    emoji: "🔥",
    category: "Emotes",
    rarity: "rare",
    price: 180,
    currency: "acoin",
    colors: ["#FF6B6B", "#FF9500"],
  },
  {
    id: "title_pioneer",
    name: "Pioneer Title",
    description: "Display 'Pioneer' under your name",
    emoji: "🚀",
    category: "Titles",
    rarity: "legendary",
    price: 2000,
    currency: "acoin",
    colors: ["#D4A853", "#FF9500"],
    isNew: true,
  },
  {
    id: "title_legend",
    name: "Legend Title",
    description: "Display 'Legend' under your name",
    emoji: "👑",
    category: "Titles",
    rarity: "legendary",
    price: 5000,
    currency: "acoin",
    colors: ["#AF52DE", "#FF3B30"],
  },
];

const CATEGORIES = ["All", "Frames", "Themes", "Bubbles", "Stickers", "Emotes", "Titles"];

const RARITY_COLORS: Record<string, [string, string]> = {
  common: ["#8E8E93", "#636366"],
  rare: ["#007AFF", "#0040DD"],
  epic: ["#AF52DE", "#7B00D4"],
  legendary: ["#FF9500", "#FF3B30"],
};

function SparkleEffect({ visible }: { visible: boolean }) {
  const sparks = Array.from({ length: 12 }, (_, i) => {
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);
    const angle = (i / 12) * Math.PI * 2;
    const dist = 50 + (i % 3) * 20;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const x = useSharedValue(0);
    const y = useSharedValue(0);

    useEffect(() => {
      if (visible) {
        const delay = i * 20;
        scale.value = withDelay(delay, withSequence(
          withSpring(1.5, { damping: 6 }),
          withDelay(300, withTiming(0, { duration: 400 }))
        ));
        opacity.value = withDelay(delay, withSequence(
          withTiming(1, { duration: 80 }),
          withDelay(400, withTiming(0, { duration: 300 }))
        ));
        x.value = withDelay(delay, withTiming(tx, { duration: 700, easing: Easing.out(Easing.cubic) }));
        y.value = withDelay(delay, withTiming(ty, { duration: 700, easing: Easing.out(Easing.cubic) }));
      }
    }, [visible]);

    const colors = ["#FF9500", "#AF52DE", "#4ECDC4", "#FF3B30", "#007AFF"];
    const color = colors[i % colors.length];

    const style = useAnimatedStyle(() => ({
      transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
      opacity: opacity.value,
    }));

    return (
      <Animated.View key={i} style={[styles.sparkle, { backgroundColor: color }, style]} />
    );
  });

  return <View style={styles.sparkleContainer} pointerEvents="none">{sparks}</View>;
}

function Item3DCard({ item, index }: { item: StoreItem; index: number }) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const CARD_W = useStoreCardWidth();
  const [showSparkle, setShowSparkle] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const scale = useSharedValue(0.8);
  const rotX = useSharedValue(0);
  const rotY = useSharedValue(0);
  const glowPulse = useSharedValue(0.5);
  const floatY = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(index * 50, withSpring(1, { damping: 14, stiffness: 200 }));

    if (item.rarity === "legendary" || item.rarity === "epic") {
      glowPulse.value = withDelay(
        index * 100,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        )
      );
    }

    floatY.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 2200 + index * 100, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2200 + index * 100, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: floatY.value },
      { perspective: 800 },
      { rotateX: `${rotX.value}deg` },
      { rotateY: `${rotY.value}deg` },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowPulse.value,
    shadowOpacity: glowPulse.value,
  }));

  const handlePurchase = () => {
    const acoin = profile?.acoin || 0;
    if (acoin < item.price) {
      showAlert("Insufficient ACoins", `You need ${item.price} ACoins but only have ${acoin}. Top up in Wallet!`, [
        { text: "Go to Wallet", onPress: () => router.push("/wallet") },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      setShowSparkle(true);
      setTimeout(() => setShowSparkle(false), 1000);
      showAlert("🎉 Purchased!", `${item.name} has been added to your profile!`, [{ text: "Awesome!" }]);
    }
    setShowModal(false);
  };

  const rarityColors = RARITY_COLORS[item.rarity];

  return (
    <>
      <Animated.View style={[{ width: CARD_W }, cardStyle]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setShowModal(true)}
          style={{ position: "relative" }}
        >
          {(item.rarity === "epic" || item.rarity === "legendary") && (
            <Animated.View
              style={[styles.itemGlow, glowStyle, { shadowColor: item.colors[0], borderColor: `${item.colors[0]}44` }]}
              pointerEvents="none"
            />
          )}
          <LinearGradient
            colors={["#0D1117", "#111827"]}
            style={[styles.itemCard, { width: CARD_W }]}
          >
            <LinearGradient
              colors={item.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.itemIconBg}
            >
              <Text style={styles.itemEmoji}>{item.emoji}</Text>
            </LinearGradient>

            <View style={styles.itemBadgeRow}>
              <LinearGradient colors={rarityColors} style={styles.rarityBadge}>
                <Text style={styles.rarityText}>{item.rarity.toUpperCase()}</Text>
              </LinearGradient>
              {item.isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newText}>NEW</Text>
                </View>
              )}
              {item.isHot && (
                <View style={styles.hotBadge}>
                  <Text style={styles.hotText}>🔥</Text>
                </View>
              )}
            </View>

            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>

            <View style={styles.priceRow}>
              <Text style={styles.coinEmoji}>🪙</Text>
              <Text style={styles.priceText}>{item.price.toLocaleString()}</Text>
            </View>
          </LinearGradient>
          <SparkleEffect visible={showSparkle} />
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: "#111827" }]}>
            <LinearGradient colors={item.colors} style={styles.modalIcon}>
              <Text style={{ fontSize: 48 }}>{item.emoji}</Text>
            </LinearGradient>
            <Text style={styles.modalTitle}>{item.name}</Text>
            <LinearGradient colors={RARITY_COLORS[item.rarity]} style={styles.modalRarity}>
              <Text style={styles.rarityText}>{item.rarity.toUpperCase()}</Text>
            </LinearGradient>
            <Text style={styles.modalDesc}>{item.description}</Text>
            <View style={styles.modalPriceRow}>
              <Text style={{ fontSize: 20 }}>🪙</Text>
              <Text style={styles.modalPrice}>{item.price.toLocaleString()} ACoins</Text>
            </View>
            <Text style={styles.modalBalance}>Your balance: 🪙 {(profile?.acoin || 0).toLocaleString()}</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePurchase} style={styles.modalBuy}>
                <LinearGradient colors={item.colors} style={styles.modalBuyGrad}>
                  <Text style={styles.modalBuyText}>Purchase</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function StoreScreen() {
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filtered =
    selectedCategory === "All"
      ? STORE_ITEMS
      : STORE_ITEMS.filter((i) => i.category === selectedCategory);

  return (
    <GestureHandlerRootView style={[styles.screen, { backgroundColor: isDark ? "#05080F" : colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: isDark ? "#0D1117" : colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={isDark ? "#fff" : colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? "#fff" : colors.text }]}>Virtual Shop</Text>
        <TouchableOpacity onPress={() => router.push("/wallet")} style={styles.coinBtn}>
          <Text style={styles.coinBtnEmoji}>🪙</Text>
          <Text style={styles.coinBtnText}>{(profile?.acoin || 0).toLocaleString()}</Text>
        </TouchableOpacity>
      </View>

      <LinearGradient
        colors={isDark ? ["#0D1117", "#05080F"] : [colors.background, colors.background]}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
            style={{ marginVertical: 16 }}
          >
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: selectedCategory === cat ? Colors.brand : (isDark ? "#111827" : colors.surface),
                    borderColor: selectedCategory === cat ? Colors.brand : (isDark ? "#1E2D3D" : colors.border),
                  },
                ]}
              >
                <Text style={[styles.categoryText, { color: selectedCategory === cat ? "#fff" : (isDark ? "#6B90B4" : colors.textSecondary) }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.grid}>
            {filtered.map((item, i) => (
              <Item3DCard key={item.id} item={item} index={i} />
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  coinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,194,203,0.15)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  coinBtnEmoji: { fontSize: 14 },
  coinBtnText: { color: "#4ECDC4", fontSize: 13, fontFamily: "Inter_700Bold" },
  categoryRow: { paddingHorizontal: 16, gap: 8 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  categoryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  itemCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E2D3D",
    overflow: "hidden",
  },
  itemGlow: {
    position: "absolute",
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    zIndex: -1,
  },
  itemIconBg: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    aspectRatio: 1,
    alignSelf: "stretch",
  },
  itemEmoji: { fontSize: 44 },
  itemBadgeRow: { flexDirection: "row", gap: 4, marginBottom: 8, alignItems: "center" },
  rarityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rarityText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  newBadge: { backgroundColor: "#4ECDC4", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  newText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },
  hotBadge: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6 },
  hotText: { fontSize: 10 },
  itemName: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  itemDesc: { color: "#6B90B4", fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 10, lineHeight: 16 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  coinEmoji: { fontSize: 14 },
  priceText: { color: "#D4A853", fontSize: 14, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", borderRadius: 24, padding: 24, alignItems: "center", maxWidth: 340 },
  modalIcon: { width: 100, height: 100, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  modalTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8 },
  modalRarity: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 12 },
  modalDesc: { color: "#6B90B4", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20, lineHeight: 20 },
  modalPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  modalPrice: { color: "#D4A853", fontSize: 20, fontFamily: "Inter_700Bold" },
  modalBalance: { color: "#4A7A9B", fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 24 },
  modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: { color: "#6B90B4", fontSize: 15, fontFamily: "Inter_500Medium" },
  modalBuy: { flex: 2, borderRadius: 14, overflow: "hidden" },
  modalBuyGrad: { height: 48, alignItems: "center", justifyContent: "center" },
  modalBuyText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sparkleContainer: { position: "absolute", top: "50%", left: "50%", width: 0, height: 0 },
  sparkle: { position: "absolute", width: 8, height: 8, borderRadius: 4, marginLeft: -4, marginTop: -4 },
});
