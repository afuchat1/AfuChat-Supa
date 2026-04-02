import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useGiftPrices } from "@/hooks/useGiftPrices";
import Colors from "@/constants/colors";

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

const RARITY_GRADIENTS: Record<string, readonly [string, string]> = {
  common:    ["#4E4E5A", "#2C2C34"] as const,
  uncommon:  ["#0B8080", "#064E4E"] as const,
  rare:      ["#1B46D6", "#0A1F90"] as const,
  epic:      ["#8C3FBF", "#4A0E88"] as const,
  legendary: ["#C85A00", "#7C2800"] as const,
};

const RARITY_COLORS: Record<string, string> = {
  common:    "#9E9E9E",
  uncommon:  "#00BCD4",
  rare:      "#2979FF",
  epic:      "#CE93D8",
  legendary: "#FFB74D",
};

const RARITY_LABEL_BG: Record<string, string> = {
  common:    "rgba(158,158,158,0.15)",
  uncommon:  "rgba(0,188,212,0.15)",
  rare:      "rgba(41,121,255,0.15)",
  epic:      "rgba(206,147,216,0.15)",
  legendary: "rgba(255,183,77,0.15)",
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
  { name: "Stardust",        emoji: "✨", base_xp_cost: 65,   rarity: "rare",      description: "A sprinkle of magical stardust" },
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

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_COLS = 4;
const CARD_GAP = 8;
const CARD_W = Math.floor((SCREEN_WIDTH - 32 - CARD_GAP * (CARD_COLS - 1)) / CARD_COLS);
const CARD_H = Math.floor(CARD_W * 1.2);

function Gift3DCard({
  gift,
  price,
  basePrice,
  selected,
  canAfford,
  onPress,
}: {
  gift: DbGift;
  price: number;
  basePrice: number;
  selected: boolean;
  canAfford: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const rarity = (gift.rarity || "common").toLowerCase();
  const gradient = RARITY_GRADIENTS[rarity] ?? RARITY_GRADIENTS.common;
  const rColor = RARITY_COLORS[rarity] ?? "#9E9E9E";

  const priceChange = basePrice > 0 ? Math.round(((price - basePrice) / basePrice) * 100) : 0;
  const showTrend = (rarity === "rare" || rarity === "epic" || rarity === "legendary") && priceChange !== 0;

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, tension: 180, friction: 8 }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: selected ? 1.06 : 1, useNativeDriver: true, tension: 180, friction: 8 }).start();
  }

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? 1.06 : 1,
      useNativeDriver: true,
      tension: 180,
      friction: 8,
    }).start();
  }, [selected]);

  return (
    <Animated.View
      style={[
        styles.cardShadow,
        {
          shadowColor: selected ? rColor : "transparent",
          transform: [{ scale }],
          opacity: canAfford ? 1 : 0.38,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        disabled={!canAfford}
        style={styles.cardTouchable}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.card,
            selected && { borderColor: rColor, borderWidth: 2 },
          ]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0.7 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Text style={styles.cardEmoji}>{gift.emoji}</Text>
          <Text style={styles.cardName} numberOfLines={1}>{gift.name}</Text>
          <View style={styles.cardPriceRow}>
            <Ionicons name="diamond" size={8} color={Colors.gold} />
            <Text style={styles.cardPrice}>{price}</Text>
          </View>
          {showTrend && (
            <View style={[styles.trendBadge, { backgroundColor: priceChange > 0 ? "#10B98133" : "#EF444433" }]}>
              <Ionicons
                name={priceChange > 0 ? "trending-up" : "trending-down"}
                size={8}
                color={priceChange > 0 ? "#10B981" : "#EF4444"}
              />
              <Text style={[styles.trendText, { color: priceChange > 0 ? "#10B981" : "#EF4444" }]}>
                {priceChange > 0 ? "+" : ""}{priceChange}%
              </Text>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getDynamicPrice, statsMap } = useGiftPrices();

  const [gifts, setGifts] = useState<DbGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<DbGift | null>(null);
  const [message, setMessage] = useState("");

  const loadGifts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("gifts").select("*").order("base_xp_cost", { ascending: true });
      if (data && data.length > 0) {
        if (data.length < 40) {
          await supabase.from("gifts").upsert(
            STATIC_GIFTS.map((g) => ({ ...g, image_url: null })),
            { onConflict: "name", ignoreDuplicates: true }
          );
          const { data: reloaded } = await supabase.from("gifts").select("*").order("base_xp_cost", { ascending: true });
          setGifts(reloaded ?? data);
        } else {
          setGifts(data);
        }
      } else {
        await supabase.from("gifts").upsert(
          STATIC_GIFTS.map((g) => ({ ...g, image_url: null })),
          { onConflict: "name", ignoreDuplicates: true }
        );
        const { data: seeded } = await supabase.from("gifts").select("*").order("base_xp_cost", { ascending: true });
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
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.kavWrapper}
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

            <View style={styles.header}>
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Send a Gift</Text>
                {recipientName && (
                  <Text style={[styles.headerSub, { color: colors.textMuted }]}>to {recipientName}</Text>
                )}
              </View>
              <View style={styles.balancePill}>
                <Ionicons name="diamond" size={13} color={Colors.gold} />
                <Text style={[styles.balanceText, { color: Colors.gold }]}>{acoinBalance} AC</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabScroll}
              contentContainerStyle={styles.tabScrollContent}
            >
              {rarities.map((r) => {
                const active = filter === r;
                const rColor = r === "all" ? colors.accent : (RARITY_COLORS[r] ?? colors.accent);
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.tab,
                      active
                        ? { backgroundColor: rColor + "28", borderColor: rColor }
                        : { backgroundColor: colors.backgroundSecondary ?? colors.inputBg, borderColor: "transparent" },
                    ]}
                    onPress={() => setFilter(r)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabText, { color: active ? rColor : colors.textMuted }]}>
                      {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading gifts…</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={styles.loadingWrap}>
                <Text style={{ fontSize: 40 }}>🎁</Text>
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>No gifts in this category</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                numColumns={CARD_COLS}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.gridContent}
                style={styles.grid}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const price = getDynamicPrice(item.id, item.base_xp_cost);
                  return (
                    <Gift3DCard
                      gift={item}
                      price={price}
                      basePrice={item.base_xp_cost}
                      selected={selected?.id === item.id}
                      canAfford={acoinBalance >= price}
                      onPress={() => setSelected(selected?.id === item.id ? null : item)}
                    />
                  );
                }}
                extraData={[selected?.id, statsMap]}
              />
            )}

            {selected && (
              <View style={[styles.confirmBar, { backgroundColor: colors.backgroundSecondary ?? colors.inputBg, borderTopColor: colors.border }]}>
                <TextInput
                  style={[styles.msgInput, { backgroundColor: colors.inputBg ?? colors.surface, color: colors.text, borderColor: colors.border }]}
                  placeholder="Add a message (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={message}
                  onChangeText={setMessage}
                  maxLength={120}
                  returnKeyType="done"
                />
                <View style={styles.confirmRow}>
                  <View style={styles.confirmGiftInfo}>
                    <Text style={styles.confirmEmoji}>{selected.emoji}</Text>
                    <View>
                      <Text style={[styles.confirmName, { color: colors.text }]} numberOfLines={1}>{selected.name}</Text>
                      <View style={styles.confirmPriceRow}>
                        <Ionicons name="diamond" size={11} color={Colors.gold} />
                        <Text style={[styles.confirmPrice, { color: Colors.gold }]}>{selectedPrice} AC</Text>
                        {priceChange !== 0 && (
                          <View style={[styles.confirmTrend, { backgroundColor: priceChange > 0 ? "#10B98120" : "#EF444420" }]}>
                            <Ionicons
                              name={priceChange > 0 ? "trending-up" : "trending-down"}
                              size={10}
                              color={priceChange > 0 ? "#10B981" : "#EF4444"}
                            />
                            <Text style={[styles.confirmTrendText, { color: priceChange > 0 ? "#10B981" : "#EF4444" }]}>
                              {priceChange > 0 ? "+" : ""}{priceChange}%
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
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
                  <Text style={styles.insufficientText}>Insufficient ACoins (need {selectedPrice}, have {acoinBalance})</Text>
                )}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    maxHeight: Dimensions.get("window").height * 0.82,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
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
  closeBtn: {
    marginLeft: 8,
  },
  tabScroll: {
    marginBottom: 8,
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    gap: 6,
    paddingBottom: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
    minHeight: 180,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  grid: {
    maxHeight: Dimensions.get("window").height * 0.38,
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: CARD_GAP,
  },
  gridRow: {
    gap: CARD_GAP,
  },
  cardShadow: {
    width: CARD_W,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 10,
    borderRadius: 16,
  },
  cardTouchable: {
    borderRadius: 16,
    overflow: "hidden",
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  cardEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  cardName: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 12,
  },
  cardPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cardPrice: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: Colors.gold,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  trendText: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
  },
  confirmBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  msgInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  confirmEmoji: {
    fontSize: 32,
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
  sendBtnDisabled: {
    opacity: 0.5,
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
