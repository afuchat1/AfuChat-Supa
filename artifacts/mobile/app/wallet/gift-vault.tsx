import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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

const BRAND = "#FF2D55";
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
              showAlert("Converted!", `${result.credited} AC added to your AfuChat wallet.\n(Fee: ${result.fee} AC)`);
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
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Gift Vault</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={{ padding: 12, gap: 12 }}>{[1,2,3,4].map(i => <GiftCardSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={
            <View>
              {/* Summary card */}
              <View style={[styles.summaryCard, { backgroundColor: BRAND }]}>
                <Text style={styles.summaryEmoji}>🎁</Text>
                <Text style={styles.summaryCount}>{pendingGifts.length}</Text>
                <Text style={styles.summaryLabel}>Unconverted gift{pendingGifts.length !== 1 ? "s" : ""}</Text>
                {pendingGifts.length > 0 && (
                  <View style={styles.summaryBreakdown}>
                    <Text style={styles.summaryBreakdownText}>
                      {gross} AC gross · {fee} AC fee (5%) · <Text style={{ color: GOLD, fontFamily: "Inter_700Bold" }}>{net} AC net</Text>
                    </Text>
                  </View>
                )}
              </View>

              {/* Convert button */}
              {pendingGifts.length > 0 && (
                <Pressable
                  style={[styles.convertBtn, converting && { opacity: 0.6 }]}
                  onPress={handleConvertAll}
                  disabled={converting}
                >
                  {converting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="swap-horizontal" size={18} color="#fff" />
                      <Text style={styles.convertBtnText}>Convert all to {net} ACoin</Text>
                    </>
                  )}
                </Pressable>
              )}

              {/* Pending gifts list */}
              {pendingGifts.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PENDING ({pendingGifts.length})</Text>
                  {pendingGifts.map((g) => (
                    <View key={g.id} style={[styles.giftRow, { backgroundColor: colors.surface }]}>
                      <Text style={styles.giftEmoji}>{g.gift_emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.giftSender, { color: colors.text }]}>From {g.sender_name}</Text>
                        <Text style={[styles.giftDate, { color: colors.textMuted }]}>{formatDate(g.sent_at)}</Text>
                      </View>
                      <View style={[styles.giftValueBadge, { backgroundColor: GOLD + "22" }]}>
                        <Text style={[styles.giftValue, { color: GOLD }]}>{MATCH_PRICES.GIFT} AC</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Already converted */}
              {doneGifts.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ALREADY CONVERTED ({doneGifts.length})</Text>
                  {doneGifts.map((g) => (
                    <View key={g.id} style={[styles.giftRow, { backgroundColor: colors.surface, opacity: 0.5 }]}>
                      <Text style={styles.giftEmoji}>{g.gift_emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.giftSender, { color: colors.text }]}>From {g.sender_name}</Text>
                        <Text style={[styles.giftDate, { color: colors.textMuted }]}>{formatDate(g.sent_at)}</Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                    </View>
                  ))}
                </>
              )}

              {allGifts.length === 0 && (
                <View style={styles.emptyWrap}>
                  <Text style={{ fontSize: 48 }}>🎁</Text>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No gifts yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Gifts sent to you in AfuMatch will appear here and can be converted to ACoins.</Text>
                </View>
              )}

              <View style={[styles.noteCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.noteText, { color: colors.textMuted }]}>
                  Each gift is worth {MATCH_PRICES.GIFT} AC. A 5% conversion fee applies. Converted ACoins are credited to your AfuChat wallet immediately.
                </Text>
              </View>

              <View style={{ height: insets.bottom + 32 }} />
            </View>
          }
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingBottom: 0 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  centeredWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  summaryCard: {
    margin: 16,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  summaryEmoji: { fontSize: 44 },
  summaryCount: { fontSize: 48, fontFamily: "Inter_700Bold", color: "#fff" },
  summaryLabel: { fontSize: 16, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },
  summaryBreakdown: {
    marginTop: 8,
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  summaryBreakdownText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.9)" },

  convertBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  convertBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  giftRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  giftEmoji: { fontSize: 32, width: 44, textAlign: "center" },
  giftSender: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  giftDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  giftValueBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  giftValue: { fontSize: 13, fontFamily: "Inter_700Bold" },

  emptyWrap: { alignItems: "center", paddingTop: 48, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  noteCard: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
