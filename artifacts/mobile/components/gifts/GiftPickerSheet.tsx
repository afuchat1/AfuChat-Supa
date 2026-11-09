import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useGiftPrices } from "@/hooks/useGiftPrices";
import { Skeleton } from "@/components/ui/Skeleton";
import Colors from "@/constants/colors";
import { formatCompactAmount } from "@/lib/formatCompactAmount";

export type DbGift = {
  id: string;
  name: string;
  emoji: string;
  base_xp_cost: number;
  rarity: string;
  description: string | null;
  image_url: string | null;
};

export type GiftPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSend: (gift: DbGift, message: string, price: number) => void;
  sending: boolean;
  acoinBalance: number;
  recipientName?: string;
};

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

const RARITY_COLORS: Record<string, string> = {
  common:    "#9E9E9E",
  uncommon:  "#1018D8",
  rare:      "#2979FF",
  epic:      "#CE93D8",
  legendary: "#FFB74D",
};

const STATIC_GIFTS = [
  { name: "Cherry Blossom",  emoji: "🌸", base_xp_cost: 5,    rarity: "common",    description: "A delicate blossom, symbol of fleeting beauty" },
  { name: "Lucky Clover",    emoji: "🍀", base_xp_cost: 4,    rarity: "common",    description: "A four-leaf clover for good luck" },
  { name: "Sunflower",       emoji: "🌻", base_xp_cost: 8,    rarity: "common",    description: "A bright and cheerful sunflower" },
  { name: "Balloon",         emoji: "🎈", base_xp_cost: 3,    rarity: "common",    description: "A colorful balloon to brighten your day" },
  { name: "Pink Bow",        emoji: "🎀", base_xp_cost: 3,    rarity: "common",    description: "A cute bow ribbon gift wrap" },
  { name: "Teddy Bear",      emoji: "🧸", base_xp_cost: 10,   rarity: "common",    description: "A cuddly teddy bear for comfort" },
  { name: "Lollipop",        emoji: "🍭", base_xp_cost: 4,    rarity: "common",    description: "A sweet spiral lollipop" },
  { name: "Hibiscus",        emoji: "🌺", base_xp_cost: 6,    rarity: "common",    description: "A tropical hibiscus flower" },
  { name: "Party Popper",    emoji: "🎊", base_xp_cost: 5,    rarity: "common",    description: "Celebrate with a party popper" },
  { name: "Gift Box",        emoji: "🎁", base_xp_cost: 12,   rarity: "common",    description: "A mysterious wrapped gift box" },

  { name: "Red Rose",        emoji: "🌹", base_xp_cost: 20,   rarity: "uncommon",  description: "A classic red rose of love and romance" },
  { name: "Bouquet",         emoji: "💐", base_xp_cost: 30,   rarity: "uncommon",  description: "A beautiful bouquet of mixed flowers" },
  { name: "Chocolate Box",   emoji: "🍫", base_xp_cost: 25,   rarity: "uncommon",  description: "A luxurious box of fine chocolates" },
  { name: "Butterfly",       emoji: "🦋", base_xp_cost: 35,   rarity: "uncommon",  description: "A graceful butterfly of transformation" },
  { name: "Music Note",      emoji: "🎵", base_xp_cost: 20,   rarity: "uncommon",  description: "A melodic note for music lovers" },
  { name: "Crescent Moon",   emoji: "🌙", base_xp_cost: 40,   rarity: "uncommon",  description: "A glowing crescent moon charm" },
  { name: "Crystal Ball",    emoji: "🔮", base_xp_cost: 45,   rarity: "uncommon",  description: "A mystical crystal ball with swirling energy" },
  { name: "Theater Mask",    emoji: "🎭", base_xp_cost: 30,   rarity: "uncommon",  description: "The drama mask of art and expression" },
  { name: "Wishing Star",    emoji: "⭐", base_xp_cost: 18,   rarity: "uncommon",  description: "A star to wish upon" },
  { name: "Music Score",     emoji: "🎶", base_xp_cost: 22,   rarity: "uncommon",  description: "A beautiful musical score" },

  { name: "Trophy",          emoji: "🏆", base_xp_cost: 75,   rarity: "rare",      description: "A golden trophy for champions" },
  { name: "Stardust",        emoji: "💎", base_xp_cost: 65,   rarity: "rare",      description: "A sprinkle of magical stardust" },
  { name: "Shooting Star",   emoji: "💫", base_xp_cost: 90,   rarity: "rare",      description: "Make a wish on this shooting star" },
  { name: "Gold Star",       emoji: "🌟", base_xp_cost: 100,  rarity: "rare",      description: "A brilliant glowing gold star" },
  { name: "Peacock",         emoji: "🦚", base_xp_cost: 130,  rarity: "rare",      description: "The regal peacock with iridescent feathers" },
  { name: "Carousel",        emoji: "🎠", base_xp_cost: 160,  rarity: "rare",      description: "A whimsical spinning carousel" },
  { name: "Rainbow",         emoji: "🌈", base_xp_cost: 80,   rarity: "rare",      description: "A vibrant rainbow of colors" },
  { name: "Big Top",         emoji: "🎪", base_xp_cost: 120,  rarity: "rare",      description: "The magical circus big top" },
  { name: "Bullseye",        emoji: "🎯", base_xp_cost: 85,   rarity: "rare",      description: "Hit the mark with this precision gift" },
  { name: "Magnet",          emoji: "🧲", base_xp_cost: 70,   rarity: "rare",      description: "You are irresistibly magnetic" },

  { name: "Crown",           emoji: "👑", base_xp_cost: 250,  rarity: "epic",      description: "A majestic royal crown" },
  { name: "Diamond Ring",    emoji: "💍", base_xp_cost: 350,  rarity: "epic",      description: "A sparkling diamond ring of devotion" },
  { name: "Dragon",          emoji: "🐉", base_xp_cost: 450,  rarity: "epic",      description: "A mythical fire-breathing dragon" },
  { name: "Galaxy",          emoji: "🌌", base_xp_cost: 380,  rarity: "epic",      description: "The infinite beauty of the galaxy" },
  { name: "Lion",            emoji: "🦁", base_xp_cost: 280,  rarity: "epic",      description: "The mighty lion king of the savanna" },
  { name: "Sacred Flame",    emoji: "🔥", base_xp_cost: 300,  rarity: "epic",      description: "An eternal sacred flame" },
  { name: "Eagle",           emoji: "🦅", base_xp_cost: 420,  rarity: "epic",      description: "The noble eagle soaring in freedom" },
  { name: "Ocean Wave",      emoji: "🌊", base_xp_cost: 320,  rarity: "epic",      description: "The powerful force of an ocean wave" },
  { name: "Fox Spirit",      emoji: "🦊", base_xp_cost: 260,  rarity: "epic",      description: "The cunning and mystical fox spirit" },
  { name: "Volcano",         emoji: "🌋", base_xp_cost: 490,  rarity: "epic",      description: "The explosive power of a volcano" },

  { name: "Flawless Diamond",  emoji: "💎", base_xp_cost: 600,  rarity: "legendary", description: "A rare flawless diamond of exceptional clarity" },
  { name: "Enchanted Castle",  emoji: "🏰", base_xp_cost: 900,  rarity: "legendary", description: "A fairytale enchanted castle" },
  { name: "Space Rocket",      emoji: "🚀", base_xp_cost: 700,  rarity: "legendary", description: "A rocket to the stars and beyond" },
  { name: "Unicorn",           emoji: "🦄", base_xp_cost: 850,  rarity: "legendary", description: "The rare and magical unicorn of legend" },
  { name: "Thunder God",       emoji: "⚡", base_xp_cost: 1200, rarity: "legendary", description: "The divine power of the thunder god" },
  { name: "Meteor Shower",     emoji: "🌠", base_xp_cost: 1500, rarity: "legendary", description: "A breathtaking celestial meteor shower" },
  { name: "Ice Queen",         emoji: "👸", base_xp_cost: 1000, rarity: "legendary", description: "The eternal Ice Queen of the frozen realm" },
  { name: "The World",         emoji: "🌍", base_xp_cost: 2000, rarity: "legendary", description: "Give them the entire world" },
  { name: "UFO",               emoji: "🛸", base_xp_cost: 1800, rarity: "legendary", description: "An extraterrestrial mystery from the cosmos" },
  { name: "Trident of Power",  emoji: "🔱", base_xp_cost: 2500, rarity: "legendary", description: "The legendary trident of divine power" },
];

const CARD_COLS = 4;
const CARD_GAP = 4;

// ── Bare gift cell — no card background, just emoji + price ──────────────────
function GiftCell({
  gift,
  price,
  selected,
  canAfford,
  onPress,
  isDark,
  cardW,
}: {
  gift: DbGift;
  price: number;
  selected: boolean;
  canAfford: boolean;
  onPress: () => void;
  isDark: boolean;
  cardW: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const rarity = (gift.rarity || "common").toLowerCase();
  const rColor = RARITY_COLORS[rarity] ?? "#9E9E9E";

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, tension: 200, friction: 8 }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: selected ? 1.1 : 1, useNativeDriver: true, tension: 200, friction: 8 }).start();
  }
  useEffect(() => {
    Animated.spring(scale, { toValue: selected ? 1.1 : 1, useNativeDriver: true, tension: 200, friction: 8 }).start();
  }, [selected]);

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={!canAfford}
      style={{ width: cardW, alignItems: "center", opacity: canAfford ? 1 : 0.3 }}
    >
      <Animated.View style={{ alignItems: "center", transform: [{ scale }] }}>
        {/* Selection ring */}
        {selected && (
          <View style={{
            position: "absolute",
            top: -6, left: -6, right: -6, bottom: -6,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: rColor,
          }} />
        )}
        <Text style={{ fontSize: 36, lineHeight: 44 }}>{gift.emoji}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
          <Ionicons name="diamond" size={8} color={Colors.gold} />
          <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: Colors.gold }}>{formatCompactAmount(price)}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function GiftPickerSheet({
  visible,
  onClose,
  onSend,
  sending,
  acoinBalance,
  recipientName,
}: GiftPickerSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { getDynamicPrice, statsMap } = useGiftPrices();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardW = React.useMemo(
    () => Math.floor((screenWidth - 32 - CARD_GAP * (CARD_COLS - 1)) / CARD_COLS),
    [screenWidth],
  );
  // Keep the picker stable while the grid and confirmation controls change.
  // The grid itself scrolls inside this fixed-height sheet.
  const sheetHeight = React.useMemo(
    () => Math.max(280, Math.floor(screenHeight * 0.25)),
    [screenHeight],
  );

  const sheetTranslateY = useRef(new Animated.Value(1000)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(sheetTranslateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      sheetTranslateY.setValue(1000);
    }
  }, [visible]);

  function dismissSheet() {
    Animated.timing(sheetTranslateY, { toValue: 1000, duration: 220, useNativeDriver: true }).start(() => onClose());
  }

  const sheetPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) sheetTranslateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80 || g.vy > 0.5) {
        Animated.timing(sheetTranslateY, { toValue: 1000, duration: 220, useNativeDriver: true }).start(() => onClose());
      } else {
        Animated.timing(sheetTranslateY, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }
    },
  })).current;

  const [gifts, setGifts] = useState<DbGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<DbGift | null>(null);
  const [message, setMessage] = useState("");

  const loadGifts = useCallback(async () => {
    setLoading(true);
    try {
      const giftCols = "id, name, emoji, base_xp_cost, rarity, description, image_url";
      const { data } = await supabase.from("gifts").select(giftCols).order("base_xp_cost", { ascending: true });
      if (data && data.length > 0) {
        if (data.length < 40) {
          await supabase.from("gifts").upsert(
            STATIC_GIFTS.map((g) => ({ ...g, image_url: null })),
            { onConflict: "name", ignoreDuplicates: true }
          );
          const { data: reloaded } = await supabase.from("gifts").select(giftCols).order("base_xp_cost", { ascending: true });
          setGifts(reloaded ?? data);
        } else {
          setGifts(data);
        }
      } else {
        await supabase.from("gifts").upsert(
          STATIC_GIFTS.map((g) => ({ ...g, image_url: null })),
          { onConflict: "name", ignoreDuplicates: true }
        );
        const { data: seeded } = await supabase.from("gifts").select(giftCols).order("base_xp_cost", { ascending: true });
        setGifts(seeded ?? []);
      }
    } catch {
      setGifts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadGifts();
      setSelected(null);
      setMessage("");
      setFilter("all");
    }
  }, [visible]);

  const rarities = ["all", ...RARITY_ORDER.filter((r) => gifts.some((g) => g.rarity === r))];
  const filtered = filter === "all" ? gifts : gifts.filter((g) => g.rarity === filter);

  function handleSend() {
    if (!selected || sending) return;
    const price = getDynamicPrice(selected.id, selected.base_xp_cost);
    onSend(selected, message, price);
    setMessage("");
    setSelected(null);
  }

  const selectedPrice = selected ? getDynamicPrice(selected.id, selected.base_xp_cost) : 0;
  const selectedBase = selected?.base_xp_cost ?? 0;
  const priceChange = selectedBase > 0 ? Math.round(((selectedPrice - selectedBase) / selectedBase) * 100) : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismissSheet}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismissSheet} />
        <Animated.View style={{ transform: [{ translateY: sheetTranslateY }], width: "100%" }}>
          <KeyboardAvoidingView behavior="padding" style={styles.kavWrapper}>
            <View style={[styles.sheet, { height: sheetHeight, backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>

              {/* Drag handle */}
              <View {...sheetPan.panHandlers} style={{ alignItems: "center", paddingTop: 8, paddingBottom: 10 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>

              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>Send a Gift</Text>
                  {recipientName && (
                    <Text style={[styles.headerSub, { color: colors.textMuted }]}>to {recipientName}</Text>
                  )}
                </View>
                <View style={styles.balancePill}>
                  <Ionicons name="diamond" size={13} color={Colors.gold} />
                  <Text style={[styles.balanceText, { color: Colors.gold }]}>{formatCompactAmount(acoinBalance)} AC</Text>
                </View>
                <TouchableOpacity onPress={dismissSheet} hitSlop={12} style={{ marginLeft: 8 }}>
                  <Ionicons name="close-circle" size={26} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* ── Gift grid ── */}
              {loading ? (
                  <View style={{ flex: 1, overflow: "hidden", paddingTop: 4 }}>
                  {Array.from({ length: 3 }).map((_, row) => (
                    <View key={row} style={{ flexDirection: "row", gap: CARD_GAP, paddingHorizontal: 16, marginBottom: CARD_GAP }}>
                      {Array.from({ length: CARD_COLS }).map((_, col) => (
                        <View key={col} style={{ width: cardW, alignItems: "center", gap: 5 }}>
                          {/* emoji placeholder — rounded square matching emoji hit area */}
                          <Skeleton width={44} height={44} borderRadius={14} />
                          {/* price pill */}
                          <Skeleton width={28} height={9} borderRadius={5} />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ) : filtered.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={{ fontSize: 40 }}>🎁</Text>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No gifts in this category</Text>
                </View>
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  key={`gifts-${CARD_COLS}`}
                  numColumns={CARD_COLS}
                  columnWrapperStyle={{ gap: CARD_GAP, paddingHorizontal: 16 }}
                  contentContainerStyle={{ gap: CARD_GAP, paddingBottom: 8, paddingTop: 4 }}
                  style={{ flex: 1, minHeight: 0 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const price = getDynamicPrice(item.id, item.base_xp_cost);
                    return (
                      <GiftCell
                        gift={item}
                        price={price}
                        selected={selected?.id === item.id}
                        canAfford={acoinBalance >= price}
                        onPress={() => setSelected(selected?.id === item.id ? null : item)}
                        isDark={isDark}
                        cardW={cardW}
                      />
                    );
                  }}
                  extraData={[selected?.id, statsMap]}
                />
              )}

              {/* ── Confirm bar ── */}
              {selected && (
                <View style={[styles.confirmBar, { borderTopColor: colors.border }]}>
                  <TextInput
                    style={[styles.msgInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder="Add a message (optional)"
                    placeholderTextColor={colors.textMuted}
                    value={message}
                    onChangeText={setMessage}
                    maxLength={120}
                    returnKeyType="done"
                  />
                  <View style={styles.confirmRow}>
                    <View style={styles.confirmGiftInfo}>
                      <Text style={{ fontSize: 34 }}>{selected.emoji}</Text>
                      <View>
                        <Text style={[styles.confirmName, { color: colors.text }]} numberOfLines={1}>{selected.name}</Text>
                        <View style={styles.confirmPriceRow}>
                          <Ionicons name="diamond" size={11} color={Colors.gold} />
                          <Text style={[styles.confirmPrice, { color: Colors.gold }]}>{formatCompactAmount(selectedPrice)} AC</Text>
                          {priceChange !== 0 && (
                            <View style={[styles.confirmTrend, { backgroundColor: priceChange > 0 ? "#10B98120" : "#EF444420" }]}>
                              <Ionicons name={priceChange > 0 ? "trending-up" : "trending-down"} size={10} color={priceChange > 0 ? "#10B981" : "#EF4444"} />
                              <Text style={[styles.confirmTrendText, { color: priceChange > 0 ? "#10B981" : "#EF4444" }]}>
                                {priceChange > 0 ? "+" : ""}{priceChange}%
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.sendBtn, (sending || acoinBalance < selectedPrice) && { opacity: 0.5 }]}
                      onPress={handleSend}
                      disabled={sending || acoinBalance < selectedPrice}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={acoinBalance >= selectedPrice ? ["#FF2D55", "#FF375F"] : ["#888", "#666"]}
                        style={styles.sendBtnGrad}
                      >
                        {sending ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="send" size={14} color="#fff" />
                            <Text style={styles.sendBtnText}>Send</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                  {acoinBalance < selectedPrice && (
                    <Text style={styles.insufficientText}>Insufficient ACoins (need {formatCompactAmount(selectedPrice)}, have {formatCompactAmount(acoinBalance)})</Text>
                  )}
                </View>
              )}

            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  kavWrapper: {
    width: "100%",
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(212,168,83,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginLeft: "auto",
  },
  balanceText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
    minHeight: 180,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  confirmBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  msgInput: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  confirmGiftInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  confirmName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    maxWidth: 140,
  },
  confirmPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  confirmPrice: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  confirmTrend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  confirmTrendText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  sendBtn: {
    borderRadius: 14,
    overflow: "hidden",
  },
  sendBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  insufficientText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    textAlign: "center",
    marginTop: -4,
  },
});
