import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import * as Haptics from "@/lib/haptics";
import Colors from "@/constants/colors";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { Avatar } from "@/components/ui/Avatar";

function fmtAmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

type Recipient = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  acoin: number;
};

export default function WalletScanPage() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { prefill_afu_id, prefill_handle } = useLocalSearchParams<{
    prefill_afu_id?: string;
    prefill_handle?: string;
  }>();

  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState<"acoin" | "nexa">("acoin");
  const [sending, setSending] = useState(false);

  const acoin = profile?.acoin ?? 0;
  const nexa = profile?.xp ?? 0;
  const balance = currency === "acoin" ? acoin : nexa;
  const currColor = currency === "acoin" ? "#34C759" : "#FF9500";
  const currIcon = currency === "acoin" ? ("diamond" as const) : ("flash" as const);

  useEffect(() => {
    if (prefill_afu_id) {
      resolveByAfuId(prefill_afu_id);
    } else if (prefill_handle) {
      resolveByHandle(prefill_handle);
    }
  }, [prefill_afu_id, prefill_handle]);

  async function resolveByAfuId(afuId: string) {
    setLoading(true);
    const { data } = await supabase.rpc("lookup_profile_by_afu_id", { p_afu_id: afuId });
    const p = data?.[0];
    if (!p) {
      showAlert("Not Found", "No user found with this AfuChat ID.");
      if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any);
      return;
    }
    setRecipient(p as Recipient);
    setLoading(false);
  }

  async function resolveByHandle(handle: string) {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id,handle,display_name,avatar_url,acoin")
      .eq("handle", handle.toLowerCase())
      .maybeSingle();
    if (!data) {
      showAlert("Not Found", "No user found with that handle.");
      if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any);
      return;
    }
    setRecipient(data as Recipient);
    setLoading(false);
  }

  async function send() {
    if (!recipient || !user || !profile) return;
    const amt = parseInt(amount);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid", "Enter a valid amount."); return; }
    if (amt > balance) { showAlert("Insufficient", `Not enough ${currency === "acoin" ? "ACoin" : "Nexa"}.`); return; }
    if (recipient.id === user.id) { showAlert("Error", "Cannot send to yourself."); return; }

    setSending(true);
    try {
      if (currency === "nexa") {
        const { data: ok, error } = await supabase
          .from("profiles")
          .update({ xp: (profile.xp || 0) - amt })
          .eq("id", user.id)
          .gte("xp", amt)
          .select("id")
          .maybeSingle();
        if (error || !ok) { showAlert("Error", "Could not deduct Nexa."); setSending(false); return; }
        const { error: ce } = await supabase.rpc("award_xp", {
          p_user_id: recipient.id,
          p_action_type: "nexa_transfer_received",
          p_xp_amount: amt,
          p_metadata: { from_user_id: user.id },
        });
        if (ce) {
          await supabase.from("profiles").update({ xp: profile.xp || 0 }).eq("id", user.id);
          showAlert("Error", "Could not credit recipient."); setSending(false); return;
        }
        await supabase.from("xp_transfers").insert({
          sender_id: user.id, receiver_id: recipient.id, amount: amt, message: note.trim() || null,
        });
      } else {
        const { error: deductErr } = await supabase.rpc("deduct_acoin", { p_user_id: user.id, p_amount: amt }).maybeSingle();
        if (deductErr) { showAlert("Error", "Could not deduct ACoin."); setSending(false); return; }
        const { error: creditErr } = await supabase.rpc("credit_acoin", { p_user_id: recipient.id, p_amount: amt });
        if (creditErr) {
          await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: amt }).then(null, () => {});
          showAlert("Error", "Could not credit recipient. Your balance has been restored."); setSending(false); return;
        }
        await Promise.all([
          supabase.from("acoin_transactions").insert({
            user_id: user.id, amount: -amt, transaction_type: "acoin_transfer_sent",
            metadata: { to_handle: recipient.handle, message: note.trim() || null },
          }),
          supabase.from("acoin_transactions").insert({
            user_id: recipient.id, amount: amt, transaction_type: "acoin_transfer_received",
            metadata: { from_handle: profile.handle, message: note.trim() || null },
          }),
        ]).catch(() => {});
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshProfile?.();
      showAlert("Sent!", `${fmtAmt(amt)} ${currency === "acoin" ? "ACoin" : "Nexa"} sent to ${recipient.display_name}`);
      router.replace("/app/afupay" as any);
    } catch {
      showAlert("Error", "Network error. Please try again.");
    }
    setSending(false);
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <GlassHeader title="Send Payment" onBack={() => router.back()} />

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>Looking up recipient…</Text>
        </View>
      ) : !recipient ? (
        <View style={s.centered}>
          <Ionicons name="person" size={48} color={colors.textMuted} />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>No recipient found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}>

          {/* Recipient card */}
          <View style={[s.recipientCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Avatar uri={recipient.avatar_url} name={recipient.display_name} size={54} />
            <View style={s.recipientInfo}>
              <Text style={[s.recipientName, { color: colors.text }]}>{recipient.display_name}</Text>
              <Text style={[s.recipientHandle, { color: colors.textMuted }]}>@{recipient.handle}</Text>
            </View>
            <View style={[s.verifiedBadge, { backgroundColor: colors.accent + "18" }]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            </View>
          </View>

          {/* Currency toggle */}
          <View style={s.currToggle}>
            {(["acoin", "nexa"] as const).map((c) => (
              <TouchableOpacity
                key={c}
                style={[s.currBtn, {
                  flex: 1,
                  backgroundColor: currency === c ? (c === "acoin" ? "#34C759" : "#FF9500") : colors.inputBg,
                  borderColor: currency === c ? (c === "acoin" ? "#34C759" : "#FF9500") : colors.border,
                }]}
                onPress={() => setCurrency(c)}
              >
                <Ionicons name={c === "acoin" ? "diamond" : "flash"} size={14} color={currency === c ? "#fff" : colors.textMuted} />
                <Text style={[s.currBtnText, { color: currency === c ? "#fff" : colors.textMuted }]}>
                  {c === "acoin" ? "ACoin" : "Nexa"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Balance pill */}
          <View style={[s.balancePill, { backgroundColor: currColor + "15", borderColor: currColor + "35" }]}>
            <Ionicons name={currIcon} size={13} color={currColor} />
            <Text style={[s.balanceText, { color: currColor }]}>
              Your balance: {fmtAmt(balance)} {currency === "acoin" ? "ACoin" : "Nexa"}
            </Text>
          </View>

          {/* Amount input */}
          <Text style={[s.label, { color: colors.textMuted }]}>AMOUNT</Text>
          <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name={currIcon} size={18} color={currColor} style={{ marginRight: 8 }} />
            <TextInput
              style={[s.input, { color: colors.text, flex: 1 }]}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
            />
            <Text style={{ color: colors.textMuted, fontFamily: "Inter_500Medium" }}>
              {currency === "acoin" ? "ACoin" : "Nexa"}
            </Text>
          </View>

          {/* Note input */}
          <Text style={[s.label, { color: colors.textMuted, marginTop: 16 }]}>NOTE (OPTIONAL)</Text>
          <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <TextInput
              style={[s.input, { color: colors.text, flex: 1 }]}
              placeholder="Add a message…"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              maxLength={120}
            />
          </View>

          {/* Amount preview */}
          {parseInt(amount) > 0 && (
            <View style={[s.previewBox, { backgroundColor: currColor + "10", borderColor: currColor + "25" }]}>
              <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
                Send {fmtAmt(parseInt(amount) || 0)} {currency === "acoin" ? "ACoin" : "Nexa"} to @{recipient.handle}
              </Text>
            </View>
          )}

          {/* Send button */}
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: currColor, opacity: (sending || !amount) ? 0.6 : 1 }]}
            onPress={send}
            disabled={sending || !amount}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="paper-plane" size={18} color="#fff" /><Text style={s.sendBtnText}>Send {currency === "acoin" ? "ACoin" : "Nexa"}</Text></>
            }
          </TouchableOpacity>

        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  content: { padding: 16, gap: 12 },
  recipientCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, borderWidth: 0.5, padding: 16,
  },
  recipientInfo: { flex: 1 },
  recipientName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  recipientHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  verifiedBadge: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  currToggle: { flexDirection: "row", gap: 10, marginTop: 4 },
  currBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  currBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  balancePill: { flexDirection: "row", alignItems: "center", gap: 6, padding: 12, borderRadius: 12, borderWidth: 1 },
  balanceText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginTop: 4 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6 },
  input: { fontSize: 15, fontFamily: "Inter_400Regular" },
  previewBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 4 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
