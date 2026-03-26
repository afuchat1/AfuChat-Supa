import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { PRESTIGE_TIERS, getPrestigeTier, getNextPrestigeTier, prestigeProgress } from "@/lib/prestige";

type RichUser = { display_name: string; handle: string; acoin: number; avatar_url: string | null };

const STATUS_GOODS = [
  { id: "sg1", name: "Crown Aura", emoji: "👑", description: "An animated crown that floats above your avatar in all chats", acoin: 50000, tier: "legend" },
  { id: "sg2", name: "Obsidian Frame", emoji: "⬛", description: "Dark chromatic border with void particle effects", acoin: 20000, tier: "obsidian" },
  { id: "sg3", name: "Diamond Halo", emoji: "💎", description: "Ice-blue halo ring visible on your profile and in conversations", acoin: 8000, tier: "diamond" },
  { id: "sg4", name: "Gold Nameplate", emoji: "🥇", description: "Your name displays in gold in every conversation", acoin: 2500, tier: "gold" },
  { id: "sg5", name: "Verified Star", emoji: "⭐", description: "A gold star badge next to your name", acoin: 1500, tier: "silver" },
  { id: "sg6", name: "Founder's Seal", emoji: "🔏", description: "One-time exclusive for early believers. Lifetime status.", acoin: 100000, tier: "legend" },
  { id: "sg7", name: "Royalty Title", emoji: "🎖️", description: "Custom title shown on your profile — 'Royalty of AfuChat'", acoin: 30000, tier: "obsidian" },
  { id: "sg8", name: "Status Glow", emoji: "✨", description: "Soft glow effect on all your messages based on your prestige color", acoin: 3000, tier: "gold" },
];

const TIER_ID_ORDER = ["bronze", "silver", "gold", "diamond", "obsidian", "legend"];

function tierIndex(id: string) { return TIER_ID_ORDER.indexOf(id); }

export default function PrestigeScreen() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [richList, setRichList] = useState<RichUser[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [aheadCount, setAheadCount] = useState<number | null>(null);

  const acoin = profile?.acoin || 0;
  const tier = getPrestigeTier(acoin);
  const nextTier = getNextPrestigeTier(acoin);
  const progress = prestigeProgress(acoin);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name, handle, acoin, avatar_url")
      .order("acoin", { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setRichList(data as RichUser[]); setLoadingList(false); });

    if (profile) {
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("acoin", acoin)
        .then(({ count }) => setAheadCount(count || 0));
    }
  }, [acoin, profile]);

  const myRichRank = richList.findIndex((u) => u.handle === profile?.handle);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Prestige Status</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

        {/* Current tier card */}
        <LinearGradient
          colors={[tier.ringColors[0] + "33", tier.ringColors[1] + "11"]}
          style={[styles.tierCard, { borderColor: tier.color + "44" }]}
        >
          <View style={styles.tierTopRow}>
            <Text style={styles.tierEmoji}>{tier.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.tierLabel, { color: tier.color }]}>{tier.label}</Text>
              <Text style={[styles.tierDesc, { color: colors.textSecondary }]}>{tier.description}</Text>
            </View>
            <View style={[styles.acoinBadge, { backgroundColor: Colors.gold + "22" }]}>
              <Text style={[styles.acoinText, { color: Colors.gold }]}>{acoin.toLocaleString()} ACoin</Text>
            </View>
          </View>

          {nextTier && (
            <View style={{ marginTop: 14 }}>
              <View style={styles.progressLabelRow}>
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                  Progress to {nextTier.emoji} {nextTier.label}
                </Text>
                <Text style={[styles.progressLabel, { color: tier.color }]}>
                  {acoin.toLocaleString()} / {nextTier.minAcoin.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.backgroundTertiary }]}>
                <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: tier.color }]} />
              </View>
              <Text style={[styles.gapText, { color: colors.textMuted }]}>
                {(nextTier.minAcoin - acoin).toLocaleString()} more ACoins needed
              </Text>
            </View>
          )}

          {!nextTier && (
            <View style={[styles.maxBadge, { backgroundColor: "#FFD700" + "22" }]}>
              <Text style={[styles.maxText, { color: "#FFD700" }]}>👑 Maximum Prestige Achieved</Text>
            </View>
          )}
        </LinearGradient>

        {/* Social pressure: standing */}
        {aheadCount !== null && (
          <View style={[styles.standingCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="people" size={22} color={Colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.standingTitle, { color: colors.text }]}>
                {aheadCount > 0
                  ? `${aheadCount.toLocaleString()} users are above your tier`
                  : "You are at the top of AfuChat!"}
              </Text>
              <Text style={[styles.standingSub, { color: colors.textMuted }]}>
                {nextTier
                  ? `Reach ${nextTier.label} tier to unlock exclusive status goods and features. Don't fall behind.`
                  : "You hold the highest prestige status. Others look up to you."}
              </Text>
            </View>
          </View>
        )}

        {/* Tier progression */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>All Tiers</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {PRESTIGE_TIERS.map((t) => {
            const isActive = t.id === tier.id;
            const isUnlocked = acoin >= t.minAcoin;
            return (
              <View
                key={t.id}
                style={[styles.tierChip, { borderColor: isActive ? t.color : colors.border, backgroundColor: isActive ? t.color + "22" : colors.surface }]}
              >
                <Text style={styles.tierChipEmoji}>{t.emoji}</Text>
                <Text style={[styles.tierChipLabel, { color: isActive ? t.color : isUnlocked ? colors.textSecondary : colors.textMuted }]}>
                  {t.label}
                </Text>
                <Text style={[styles.tierChipMin, { color: colors.textMuted }]}>
                  {t.minAcoin >= 1000 ? `${t.minAcoin / 1000}K` : t.minAcoin} ACoin
                </Text>
                {isActive && <View style={[styles.activeIndicator, { backgroundColor: t.color }]} />}
              </View>
            );
          })}
        </ScrollView>

        {/* Status vertical goods */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Status Goods</Text>
          <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Exclusive items that show your power</Text>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {STATUS_GOODS.map((item) => {
            const itemTier = PRESTIGE_TIERS.find((t) => t.id === item.tier)!;
            const canAfford = acoin >= item.acoin;
            const tierUnlocked = tierIndex(tier.id) >= tierIndex(item.tier);

            return (
              <View
                key={item.id}
                style={[styles.goodCard, { backgroundColor: colors.surface, borderColor: tierUnlocked ? itemTier.color + "33" : colors.border, opacity: tierUnlocked ? 1 : 0.5 }]}
              >
                <Text style={styles.goodEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.goodTopRow}>
                    <Text style={[styles.goodName, { color: colors.text }]}>{item.name}</Text>
                    <View style={[styles.tierReqBadge, { backgroundColor: itemTier.color + "22" }]}>
                      <Text style={[styles.tierReqText, { color: itemTier.color }]}>{itemTier.emoji} {itemTier.label}+</Text>
                    </View>
                  </View>
                  <Text style={[styles.goodDesc, { color: colors.textSecondary }]}>{item.description}</Text>
                  <View style={styles.goodFooter}>
                    <Text style={[styles.goodPrice, { color: Colors.gold }]}>{item.acoin.toLocaleString()} ACoin</Text>
                    {!tierUnlocked && (
                      <Text style={[styles.goodLocked, { color: colors.textMuted }]}>Reach {itemTier.label} to unlock</Text>
                    )}
                  </View>
                </View>
                {tierUnlocked && (
                  <TouchableOpacity
                    style={[styles.goodBtn, { backgroundColor: canAfford ? Colors.brand : colors.backgroundTertiary }]}
                    onPress={() => router.push("/wallet")}
                  >
                    <Text style={[styles.goodBtnText, { color: canAfford ? "#fff" : colors.textMuted }]}>
                      {canAfford ? "Get" : "Fund"}
                    </Text>
                  </TouchableOpacity>
                )}
                {!tierUnlocked && (
                  <View style={[styles.goodBtn, { backgroundColor: colors.backgroundTertiary }]}>
                    <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Rich List */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Rich List</Text>
          <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Top ACoin holders in AfuChat</Text>
        </View>

        {loadingList ? (
          <ActivityIndicator color={Colors.brand} style={{ marginVertical: 20 }} />
        ) : (
          <View style={[styles.richListCard, { backgroundColor: colors.surface }]}>
            {richList.map((u, idx) => {
              const uTier = getPrestigeTier(u.acoin || 0);
              const isMe = u.handle === profile?.handle;
              return (
                <TouchableOpacity
                  key={u.handle}
                  style={[styles.richRow, idx < richList.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                  onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.handle } })}
                >
                  <Text style={[styles.richRank, { color: idx < 3 ? Colors.gold : colors.textMuted }]}>
                    #{idx + 1}
                  </Text>
                  <Text style={{ fontSize: 18 }}>{uTier.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.richName, { color: isMe ? Colors.brand : colors.text }]}>
                      {u.display_name} {isMe ? "(You)" : ""}
                    </Text>
                    <Text style={[styles.richHandle, { color: colors.textMuted }]}>@{u.handle}</Text>
                  </View>
                  <Text style={[styles.richAcoin, { color: Colors.gold }]}>{(u.acoin || 0).toLocaleString()} 🪙</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  tierCard: { margin: 16, borderRadius: 20, padding: 18, borderWidth: 1.5 },
  tierTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tierEmoji: { fontSize: 42 },
  tierLabel: { fontSize: 22, fontFamily: "Inter_700Bold" },
  tierDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  acoinBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  acoinText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  progressLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progressLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  gapText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  maxBadge: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: "flex-start" },
  maxText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  standingCard: { marginHorizontal: 16, borderRadius: 14, padding: 14, flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 8 },
  standingTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  standingSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  tierChip: { borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: "center", minWidth: 90, position: "relative" },
  tierChipEmoji: { fontSize: 24, marginBottom: 4 },
  tierChipLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tierChipMin: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  activeIndicator: { position: "absolute", bottom: 6, width: 20, height: 3, borderRadius: 2 },
  goodCard: { borderRadius: 14, padding: 14, flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1 },
  goodEmoji: { fontSize: 30, width: 44, textAlign: "center" },
  goodTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  goodName: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  tierReqBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  tierReqText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  goodDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 6 },
  goodFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  goodPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  goodLocked: { fontSize: 11, fontFamily: "Inter_400Regular" },
  goodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignItems: "center", justifyContent: "center", minWidth: 48 },
  goodBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  richListCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  richRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  richRank: { fontSize: 13, fontFamily: "Inter_700Bold", width: 28 },
  richName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  richHandle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  richAcoin: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
