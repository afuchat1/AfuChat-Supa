import React, { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ReferralSkeleton } from "@/components/ui/Skeleton";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import * as Clipboard from "expo-clipboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

type ReferralStats = {
  total_referrals: number;
  total_nexa_earned: number;
};

type ReferralEntry = {
  id: string;
  referred_display_name: string;
  referred_handle: string;
  reward_given: boolean;
  created_at: string;
};

export default function ReferralScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<ReferralStats>({ total_referrals: 0, total_nexa_earned: 0 });
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const referralLink = `https://afuchat.com/${profile?.handle || ""}`;

  const loadReferrals = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("referrals")
      .select("id, reward_given, created_at, referred_id")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      const referredIds = data.map((r: any) => r.referred_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle")
        .in("id", referredIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const entries: ReferralEntry[] = data.map((r: any) => {
        const p = profileMap.get(r.referred_id);
        return {
          id: r.id,
          referred_display_name: p?.display_name || "User",
          referred_handle: p?.handle || "",
          reward_given: r.reward_given,
          created_at: r.created_at,
        };
      });

      setReferrals(entries);
      setStats({
        total_referrals: data.length,
        total_nexa_earned: data.filter((r: any) => r.reward_given).length * 2000,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadReferrals(); }, [loadReferrals]);

  async function handleShare() {
    Haptics.selectionAsync();
    try {
      await Share.share({
        message: `Join me on AfuChat! Sign up with my link and get 1 week of free Platinum premium: ${referralLink}`,
        url: referralLink,
      });
    } catch {}
  }

  async function handleCopyLink() {
    Haptics.selectionAsync();
    await Clipboard.setStringAsync(referralLink);
    showAlert("Copied!", "Referral link copied to clipboard.");
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Referral Program</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.heroCard, { backgroundColor: colors.accent }]}>
          <Ionicons name="gift" size={40} color="rgba(255,255,255,0.9)" />
          <Text style={styles.heroTitle}>Invite Friends, Earn Rewards</Text>
          <Text style={styles.heroSub}>
            Share your link. When friends join, they get 1 week of free Platinum premium, and you earn 2,000 Nexa!
          </Text>
        </View>

        <View style={[styles.linkCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.linkLabel, { color: colors.textMuted }]}>Your Referral Link</Text>
          <View style={[styles.linkRow, { backgroundColor: colors.inputBg }]}>
            <Text style={[styles.linkText, { color: colors.text }]} numberOfLines={1}>{referralLink}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={handleCopyLink}>
              <Ionicons name="copy-outline" size={18} color={colors.accent} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Ionicons name="share-social" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>Share Link</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="people" size={24} color={colors.accent} />
            <Text style={[styles.statValue, { color: colors.text }]}>{stats.total_referrals}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Friends Joined</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="flash" size={24} color="#FFD60A" />
            <Text style={[styles.statValue, { color: colors.text }]}>{stats.total_nexa_earned}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Nexa Earned</Text>
          </View>
        </View>

        <View style={[styles.howItWorks, { backgroundColor: colors.surface }]}>
          <Text style={[styles.howTitle, { color: colors.text }]}>How It Works</Text>
          {[
            { icon: "link-outline", text: `Share your referral link: afuchat.com/${profile?.handle || "username"}` },
            { icon: "person-add-outline", text: "Friends open your link and sign up on AfuChat" },
            { icon: "diamond-outline", text: "They automatically get 1 week free Platinum" },
            { icon: "flash-outline", text: "You receive 2,000 Nexa bonus" },
          ].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: colors.accent + "18" }]}>
                <Ionicons name={step.icon as any} size={18} color={colors.accent} />
              </View>
              <Text style={[styles.stepText, { color: colors.textSecondary }]}>{step.text}</Text>
            </View>
          ))}
        </View>

        {loading ? (
          <ReferralSkeleton />
        ) : referrals.length > 0 ? (
          <View style={[styles.listSection, { backgroundColor: colors.surface }]}>
            <Text style={[styles.listTitle, { color: colors.text }]}>Recent Referrals</Text>
            {referrals.map((r) => (
              <View key={r.id} style={[styles.referralRow, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.referralName, { color: colors.text }]}>{r.referred_display_name}</Text>
                  <Text style={[styles.referralHandle, { color: colors.textMuted }]}>@{r.referred_handle}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.referralReward, { color: r.reward_given ? "#34C759" : colors.textMuted }]}>
                    {r.reward_given ? "+2,000 Nexa" : "Pending"}
                  </Text>
                  <Text style={[styles.referralDate, { color: colors.textMuted }]}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No referrals yet. Share your link to get started!</Text>
          </View>
        )}
      </ScrollView>
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
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  heroCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 20 },
  linkCard: { borderRadius: 14, padding: 16, gap: 12 },
  linkLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  linkRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  linkText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  copyBtn: { padding: 4 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.brand,
    borderRadius: 12,
    paddingVertical: 12,
  },
  shareBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: { flex: 1, borderRadius: 14, padding: 16, alignItems: "center", gap: 8 },
  statValue: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  howItWorks: { borderRadius: 14, padding: 16, gap: 14 },
  howTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stepText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  listSection: { borderRadius: 14, padding: 16, gap: 4 },
  listTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  referralRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  referralName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  referralHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  referralReward: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  referralDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
