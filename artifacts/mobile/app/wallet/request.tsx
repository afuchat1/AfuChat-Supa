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

type Target = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
};

export default function MoneyRequestScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { afu_id, handle } = useLocalSearchParams<{ afu_id?: string; handle?: string }>();

  const [target, setTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState<"acoin" | "nexa">("acoin");
  const [sending, setSending] = useState(false);

  const currColor = currency === "acoin" ? "#34C759" : "#FF9500";

  useEffect(() => {
    if (afu_id) resolveByAfuId(afu_id);
    else if (handle) resolveByHandle(handle);
    else if (afu_id !== undefined || handle !== undefined) {
      showAlert("Error", "No target specified.");
      if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any);
    }
  }, [afu_id, handle]);

  async function resolveByAfuId(id: string) {
    setLoading(true);
    const { data } = await supabase.rpc("lookup_profile_by_afu_id", { p_afu_id: id });
    const p = data?.[0];
    if (!p) { showAlert("Not Found", "No user found with this AfuChat ID."); if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any); return; }
    setTarget(p as Target);
    setLoading(false);
  }

  async function resolveByHandle(h: string) {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id,handle,display_name,avatar_url")
      .eq("handle", h.toLowerCase())
      .maybeSingle();
    if (!data) { showAlert("Not Found", "No user found."); if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any); return; }
    setTarget(data as Target);
    setLoading(false);
  }

  async function sendRequest() {
    if (!target || !user || !profile) return;
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid Amount", "Enter a valid amount greater than 0."); return; }
    if (target.id === user.id) { showAlert("Error", "You can't request money from yourself."); return; }

    setSending(true);
    try {
      const { error } = await supabase.from("money_requests").insert({
        requester_id: user.id,
        target_id: target.id,
        currency,
        amount: amt,
        note: note.trim() || null,
      });

      if (error) { showAlert("Error", "Could not send request. Please try again."); setSending(false); return; }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(
        "Request Sent!",
        `Your request for ${fmtAmt(amt)} ${currency === "acoin" ? "ACoin" : "Nexa"} has been sent to @${target.handle}.`,
        [{ text: "OK", onPress: () => { if (router.canGoBack()) router.back(); } }]
      );
    } catch {
      showAlert("Error", "Network error. Please try again.");
    }
    setSending(false);
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <GlassHeader title="Request Money" onBack={() => router.back()} />

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[s.hint, { color: colors.textMuted }]}>Looking up user…</Text>
        </View>
      ) : !target ? (
        <View style={s.centered}>
          <Ionicons name="person" size={48} color={colors.textMuted} />
          <Text style={[s.hint, { color: colors.textMuted }]}>No user found</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info banner */}
          <View style={[s.banner, { backgroundColor: "#FF9500" + "14", borderColor: "#FF9500" + "30" }]}>
            <Ionicons name="hand-left" size={16} color="#FF9500" />
            <Text style={{ color: "#FF9500", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 }}>
              You're requesting money from this user. They can accept or deny.
            </Text>
          </View>

          {/* Target card */}
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Avatar uri={target.avatar_url} name={target.display_name} size={54} />
            <View style={{ flex: 1 }}>
              <Text style={[s.name, { color: colors.text }]}>{target.display_name}</Text>
              <Text style={[s.handle, { color: colors.textMuted }]}>@{target.handle}</Text>
            </View>
            <View style={[s.iconBadge, { backgroundColor: "#FF9500" + "18" }]}>
              <Ionicons name="hand-left" size={16} color="#FF9500" />
            </View>
          </View>

          {/* Currency toggle */}
          <View style={s.toggleRow}>
            {(["acoin", "nexa"] as const).map((c) => {
              const active = currency === c;
              const col = c === "acoin" ? "#34C759" : "#FF9500";
              return (
                <TouchableOpacity
                  key={c}
                  style={[s.toggleBtn, { flex: 1, backgroundColor: active ? col : colors.inputBg, borderColor: active ? col : colors.border }]}
                  onPress={() => setCurrency(c)}
                >
                  <Ionicons name={c === "acoin" ? "diamond" : "flash"} size={14} color={active ? "#fff" : colors.textMuted} />
                  <Text style={[s.toggleBtnText, { color: active ? "#fff" : colors.textMuted }]}>
                    {c === "acoin" ? "ACoin" : "Nexa XP"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Amount */}
          <Text style={[s.label, { color: colors.textMuted }]}>AMOUNT TO REQUEST</Text>
          <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name={currency === "acoin" ? "diamond" : "flash"} size={18} color={currColor} style={{ marginRight: 8 }} />
            <TextInput
              style={[s.input, { color: colors.text }]}
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

          {/* Note */}
          <Text style={[s.label, { color: colors.textMuted, marginTop: 14 }]}>REASON (OPTIONAL)</Text>
          <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <TextInput
              style={[s.input, { color: colors.text }]}
              placeholder="e.g. Split bill, lunch, bet…"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              maxLength={120}
            />
          </View>

          {/* Preview */}
          {parseInt(amount, 10) > 0 && (
            <View style={[s.preview, { backgroundColor: currColor + "10", borderColor: currColor + "25" }]}>
              <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
                Request {fmtAmt(parseInt(amount, 10) || 0)} {currency === "acoin" ? "ACoin" : "Nexa"} from @{target.handle}
              </Text>
              {note.trim() ? (
                <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 }}>
                  "{note}"
                </Text>
              ) : null}
            </View>
          )}

          {/* Send */}
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: "#FF9500", opacity: sending || !amount ? 0.6 : 1 }]}
            onPress={sendRequest}
            disabled={sending || !amount}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="hand-left" size={18} color="#fff" /><Text style={s.sendBtnText}>Send Request</Text></>}
          </TouchableOpacity>

          <Text style={[s.hint, { color: colors.textMuted }]}>
            Requests expire after 48 hours if not responded to.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  content: { padding: 16, gap: 12 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, borderWidth: 0.5, padding: 16 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  iconBadge: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  toggleRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  toggleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  toggleBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginTop: 4 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginTop: 6 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  preview: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 4 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
});
