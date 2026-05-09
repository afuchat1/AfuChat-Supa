import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { GiftCardSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import {
  MATCH_PRICES,
  ReceivedMatchGift,
  convertMatchGiftsToAcoins,
  getConvertedGiftIds,
  getReceivedMatchGifts,
} from "@/lib/matchTransactions";
import Colors from "@/constants/colors";

const GIFT_BRAND = "#FF2D55";
const GOLD = "#FFD60A";
const FEE_PERCENT = 5;

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function calcConversion(count: number) {
  const gross = count * MATCH_PRICES.GIFT;
  const fee = Math.ceil(gross * (FEE_PERCENT / 100));
  const net = Math.max(1, gross - fee);
  return { gross, fee, net };
}

export default function GiftVaultScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [allGifts, setAllGifts] = useState<ReceivedMatchGift[]>([]);
  const [convertedIds, setConvertedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [gifts, converted] = await Promise.all([
      getReceivedMatchGifts(user.id),
      getConvertedGiftIds(user.id),
    ]);
    setAllGifts(gifts);
    setConvertedIds(converted);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const pendingGifts = allGifts.filter((g) => !convertedIds.has(g.id));
  const doneGifts = allGifts.filter((g) => convertedIds.has(g.id));
  const { gross, fee, net } = calcConversion(pendingGifts.length);

  async function handleConvertAll() {
    if (pendingGifts.length === 0) return;
    showAlert(
      "Convert Gifts to ACoins",
      `${pendingGifts.length} gift${pendingGifts.length > 1 ? "s" : ""} = ${gross} AC gross\n5% fee = ${fee} AC\nYou'll receive ${net} AC`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Receive ${net} AC`,
          onPress: async () => {
            setConverting(true);
            const ids = pendingGifts.map((g) => g.id);
            const result = await convertMatchGiftsToAcoins(user!.id, ids);
            if (result.success) {
              refreshProfile();
              await load();
              showAlert("Converted!", `${result.credited} AC added to your wallet.\n(Fee: ${result.fee} AC)`);
            } else {
              showAlert("Error", result.error ?? "Conversion failed");
            }
            setConverting(false);
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <LinearGradient colors={["#2A0612", "#110208"]} style={[styles.gradHeader, { paddingTop: insets.top + 14 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.gradTitle}>Gift Vault</Text>
          <Text style={styles.gradSub}>Convert match gifts to ACoin</Text>
        </View>
        <View style={[styles.gradBadge, { backgroundColor: GIFT_BRAND + "30", borderColor: GIFT_BRAND + "60" }]}>
          <Text style={{ fontSize: 18 }}>🎁</Text>
          <Text style={[styles.gradBadgeText, { color: GIFT_BRAND }]}>{pendingGifts.length}</Text>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>{[1,2,3,4].map(i => <GiftCardSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          ListHeaderComponent={
            <View>
              {/* Summary hero */}
              {pendingGifts.length > 0 ? (
                <View style={styles.summaryCard}>
                  <LinearGradient colors={["#FF2D55", "#CC0035"]} style={styles.summaryGrad}>
                    <Text style={styles.summaryEmoji}>🎁</Text>
                    <Text style={styles.summaryCount}>{pendingGifts.length}</Text>
                    <Text style={styles.summaryLabel}>
                      {pendingGifts.length === 1 ? "unconverted gift" : "unconverted gifts"}
                    </Text>
                    {/* Breakdown */}
                    <View style={styles.breakdownRow}>
                      <View style={styles.breakdownItem}>
                        <Text style={styles.breakdownNum}>{gross}</Text>
                        <Text style={styles.breakdownLabel}>Gross AC</Text>
                      </View>
                      <View style={[styles.breakdownDivider]} />
                      <View style={styles.breakdownItem}>
                        <Text style={styles.breakdownNum}>{fee}</Text>
                        <Text style={styles.breakdownLabel}>Fee (5%)</Text>
                      </View>
                      <View style={[styles.breakdownDivider]} />
                      <View style={styles.breakdownItem}>
                        <Text style={[styles.breakdownNum, { color: GOLD }]}>{net}</Text>
                        <Text style={[styles.breakdownLabel, { color: GOLD }]}>You get</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </View>
              ) : (
                <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <Text style={{ fontSize: 52, marginBottom: 10 }}>🎁</Text>
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>No gifts to convert</Text>
                    <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                      Receive gifts in AfuMatch and they'll appear here ready to convert.
                    </Text>
                  </View>
                </View>
              )}

              {/* Convert button */}
              {pendingGifts.length > 0 && (
                <TouchableOpacity
                  style={[styles.convertBtn, converting && { opacity: 0.6 }]}
                  onPress={handleConvertAll} disabled={converting} activeOpacity={0.85}
                >
                  <LinearGradient colors={["#FF2D55", "#CC0035"]} style={styles.convertBtnGrad}>
                    {converting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="swap-horizontal" size={18} color="#fff" />
                        <Text style={styles.convertBtnText}>Convert all → {net} ACoin</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}

              {/* Pending gifts */}
              {pendingGifts.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PENDING</Text>
                    <View style={[styles.sectionBadge, { backgroundColor: GIFT_BRAND + "20" }]}>
                      <Text style={[styles.sectionBadgeText, { color: GIFT_BRAND }]}>{pendingGifts.length}</Text>
                    </View>
                  </View>
                  {pendingGifts.map((g) => (
                    <View key={g.id} style={[styles.giftCard, { backgroundColor: colors.surface }]}>
                      <View style={[styles.giftEmojiWrap, { backgroundColor: GIFT_BRAND + "12" }]}>
                        <Text style={styles.giftEmoji}>{g.gift_emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.giftSender, { color: colors.text }]}>From {g.sender_name}</Text>
                        <Text style={[styles.giftDate, { color: colors.textMuted }]}>{formatDate(g.sent_at)}</Text>
                      </View>
                      <View style={[styles.valueBadge, { backgroundColor: GOLD + "18", borderColor: GOLD + "40" }]}>
                        <Ionicons name="diamond" size={11} color={GOLD} />
                        <Text style={[styles.valueText, { color: GOLD }]}>{MATCH_PRICES.GIFT} AC</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Already converted */}
              {doneGifts.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>CONVERTED</Text>
                    <View style={[styles.sectionBadge, { backgroundColor: "#34C75920" }]}>
                      <Text style={[styles.sectionBadgeText, { color: "#34C759" }]}>{doneGifts.length}</Text>
                    </View>
                  </View>
                  {doneGifts.map((g) => (
                    <View key={g.id} style={[styles.giftCard, { backgroundColor: colors.surface, opacity: 0.55 }]}>
                      <View style={[styles.giftEmojiWrap, { backgroundColor: colors.inputBg }]}>
                        <Text style={styles.giftEmoji}>{g.gift_emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.giftSender, { color: colors.text }]}>From {g.sender_name}</Text>
                        <Text style={[styles.giftDate, { color: colors.textMuted }]}>{formatDate(g.sent_at)}</Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={22} color="#34C759" />
                    </View>
                  ))}
                </>
              )}

              {/* Info card */}
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                <Text style={[styles.infoText, { color: colors.textMuted }]}>
                  Each gift is worth {MATCH_PRICES.GIFT} AC. A 5% fee applies. ACoins are credited to your wallet instantly.
                </Text>
              </View>
            </View>
          }
          keyExtractor={(_, i) => String(i)}
        />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  gradHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 18, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  gradTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  gradSub: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "Inter_400Regular", marginTop: 2 },
  gradBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  gradBadgeText: { fontSize: 18, fontFamily: "Inter_700Bold" },

  summaryCard: { margin: 16, borderRadius: 24, overflow: "hidden" },
  summaryGrad: { padding: 28, alignItems: "center", gap: 8 },
  summaryEmoji: { fontSize: 52 },
  summaryCount: { fontSize: 56, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 60 },
  summaryLabel: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },

  breakdownRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8, gap: 0 },
  breakdownItem: { flex: 1, alignItems: "center", gap: 4 },
  breakdownNum: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  breakdownLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.65)" },
  breakdownDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: "rgba(255,255,255,0.2)" },

  convertBtn: { marginHorizontal: 16, marginBottom: 8, borderRadius: 18, overflow: "hidden" },
  convertBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  convertBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  sectionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sectionBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  giftCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, borderRadius: 16, padding: 14, gap: 12 },
  giftEmojiWrap: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  giftEmoji: { fontSize: 28 },
  giftSender: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  giftDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  valueBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  valueText: { fontSize: 12, fontFamily: "Inter_700Bold" },

  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, paddingHorizontal: 20 },

  infoCard: { flexDirection: "row", gap: 10, marginHorizontal: 16, marginTop: 20, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
