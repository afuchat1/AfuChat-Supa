import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyGiftReceived } from "@/lib/notifyUser";
import { shareRedEnvelope } from "@/lib/share";
import { isUuid, isEncodedId, decodeId } from "@/lib/shortId";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { ListRowSkeleton } from "@/components/ui/Skeleton";

type Envelope = {
  id: string;
  sender_id: string;
  total_amount: number;
  recipient_count: number;
  claimed_count: number;
  message: string;
  envelope_type: string;
  created_at: string;
  is_expired: boolean;
  sender: { display_name: string; avatar_url: string | null; is_verified?: boolean; is_organization_verified?: boolean };
};

type Claim = {
  id: string;
  amount: number;
  claimed_at: string;
  claimer: { display_name: string; avatar_url: string | null; is_verified?: boolean; is_organization_verified?: boolean };
};

export default function RedEnvelopeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    if (!rawId) return rawId;
    if (isUuid(rawId)) return rawId;
    if (isEncodedId(rawId)) return decodeId(rawId);
    return rawId;
  }, [rawId]);
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [myClaim, setMyClaim] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id || !user) return;
    const { data } = await supabase
      .from("red_envelopes")
      .select("id, sender_id, total_amount, recipient_count, claimed_count, message, envelope_type, created_at, is_expired, profiles!red_envelopes_sender_id_fkey(display_name, avatar_url, is_verified, is_organization_verified)")
      .eq("id", id)
      .single();

    if (data) {
      setEnvelope({ ...data, sender: (data as any).profiles } as any);
    }

    const { data: claimData } = await supabase
      .from("red_envelope_claims")
      .select("id, amount, claimed_at, profiles!red_envelope_claims_claimer_id_fkey(display_name, avatar_url, is_verified, is_organization_verified)")
      .eq("red_envelope_id", id)
      .order("claimed_at", { ascending: true });

    if (claimData) {
      setClaims(claimData.map((c: any) => ({ ...c, claimer: c.profiles })));
    }

    const { data: myClaimCheck } = await supabase
      .from("red_envelope_claims")
      .select("amount")
      .eq("red_envelope_id", id)
      .eq("claimer_id", user.id)
      .maybeSingle();
    if (myClaimCheck) setMyClaim(myClaimCheck.amount);

    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  async function claim() {
    if (!user || !envelope || claiming) return;
    const remainingCount = envelope.recipient_count - envelope.claimed_count;
    if (remainingCount <= 0 || envelope.is_expired) {
      showAlert("Gone!", "All envelopes have been claimed.");
      return;
    }

    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_red_envelope", {
      p_envelope_id: envelope.id,
    });

    if (error || !data?.success) {
      showAlert("Error", data?.message || error?.message || "Failed to claim red envelope.");
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMyClaim(data.amount);
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("red_envelope_claimed"); } catch (_) {}
      if (envelope.sender_id !== user.id) {
        notifyGiftReceived({
          recipientId: envelope.sender_id,
          senderName: profile?.display_name || "Someone",
          senderUserId: user.id,
          giftName: `opened your red envelope (${data.amount} ACoin)`,
        });
      }
      load();
    }
    setClaiming(false);
  }

  if (loading) return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <View style={{ width: "100%", padding: 16, gap: 8 }}>
        {[1, 2, 3].map((i) => <ListRowSkeleton key={i} />)}
      </View>
    </View>
  );
  if (!envelope) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.text }}>Envelope not found</Text></View>;

  const remainingCount = envelope.recipient_count - envelope.claimed_count;
  const claimedTotal = claims.reduce((sum, c) => sum + c.amount, 0);
  const remainingAmount = envelope.total_amount - claimedTotal;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: "#FF3B30" }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>🧧 Red Envelope</Text>
        <TouchableOpacity onPress={() => shareRedEnvelope({ envelopeId: id!, senderName: envelope.sender.display_name })}>
          <Ionicons name="share-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.envelopeCard}>
        <Avatar uri={envelope.sender.avatar_url} name={envelope.sender.display_name} size={56} />
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.senderName}>{envelope.sender.display_name}</Text>
          <VerifiedBadge isVerified={envelope.sender.is_verified} isOrganizationVerified={envelope.sender.is_organization_verified} size={16} />
        </View>
        <Text style={styles.envelopeMsg}>{envelope.message}</Text>

        {myClaim !== null ? (
          <View style={styles.claimedSection}>
            <Text style={styles.claimedAmount}>{myClaim} ACoin</Text>
            <Text style={styles.claimedLabel}>You received</Text>
          </View>
        ) : remainingCount > 0 && !envelope.is_expired ? (
          <TouchableOpacity style={styles.claimBtn} onPress={claim} disabled={claiming}>
            {claiming ? <ActivityIndicator color="#FF3B30" /> : <Text style={styles.claimBtnText}>Open</Text>}
          </TouchableOpacity>
        ) : (
          <Text style={styles.goneText}>All claimed</Text>
        )}

        <Text style={styles.statsText}>
          {envelope.claimed_count}/{envelope.recipient_count} claimed · {remainingAmount} ACoin remaining
        </Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Claims</Text>
      <FlatList
        data={claims}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.claimRow, { backgroundColor: colors.surface }]}>
            <Avatar uri={item.claimer.avatar_url} name={item.claimer.display_name} size={40} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[styles.claimName, { color: colors.text }]}>{item.claimer.display_name}</Text>
                <VerifiedBadge isVerified={item.claimer.is_verified} isOrganizationVerified={item.claimer.is_organization_verified} size={13} />
              </View>
              <Text style={[styles.claimTime, { color: colors.textMuted }]}>{new Date(item.claimed_at).toLocaleTimeString()}</Text>
            </View>
            <Text style={[styles.claimAmount, { color: "#FF3B30" }]}>{item.amount} ACoin</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 90 }}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>No claims yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  envelopeCard: { backgroundColor: "#FF3B30", paddingVertical: 32, paddingHorizontal: 24, alignItems: "center", gap: 8, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  senderName: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff" },
  envelopeMsg: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)" },
  claimedSection: { alignItems: "center", marginVertical: 8 },
  claimedAmount: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#FFD60A" },
  claimedLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  claimBtn: { backgroundColor: "#fff", paddingHorizontal: 48, paddingVertical: 14, borderRadius: 28, marginTop: 8 },
  claimBtnText: { color: "#FF3B30", fontSize: 18, fontFamily: "Inter_700Bold" },
  goneText: { fontSize: 16, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.6)", marginTop: 8 },
  statsText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 8 },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  claimRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  claimName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  claimTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  claimAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyText: { textAlign: "center", marginTop: 32, fontSize: 15, fontFamily: "Inter_400Regular" },
});
