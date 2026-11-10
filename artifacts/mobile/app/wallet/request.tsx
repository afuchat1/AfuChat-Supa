import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/AfuTextInput";
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
  const [afuIdInput, setAfuIdInput] = useState(afu_id ?? "");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState<"acoin" | "nexa">("acoin");
  const [sending, setSending] = useState(false);
  const lookupAttempt = useRef(0);

  const currColor = currency === "acoin" ? "#34C759" : "#FF9500";

  const lookupTarget = useCallback(async (value: string, lookupBy: "afu_id" | "handle" = "afu_id") => {
    const attempt = ++lookupAttempt.current;
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const normalizedValue = lookupBy === "afu_id"
      ? digits.padStart(8, "0")
      : value.trim().replace(/^@/, "").toLowerCase();

    if (!normalizedValue || (lookupBy === "afu_id" && digits.length === 0)) {
      setLookupError("Enter the 8-digit AfuChat ID.");
      setTarget(null);
      setLoading(false);
      return;
    }

    setTarget(null);
    setLookupError(null);
    setLoading(true);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const lookup = lookupBy === "afu_id"
        ? supabase.rpc("lookup_profile_by_afu_id", { p_afu_id: normalizedValue }).then(({ data, error }) => {
            if (error) throw error;
            return (data?.[0] as Target | undefined) ?? null;
          })
        : supabase
            .from("profiles")
            .select("id,handle,display_name,avatar_url")
            .eq("handle", normalizedValue)
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) throw error;
              return (data as Target | null) ?? null;
            });
      const timedOut = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("lookup_timeout")), 15_000);
      });
      const resolved = await Promise.race([lookup, timedOut]);
      if (attempt !== lookupAttempt.current) return;
      if (!resolved) {
        setLookupError("No user found. Check the AfuChat ID and try again.");
        return;
      }
      setTarget(resolved);
    } catch (error) {
      if (attempt !== lookupAttempt.current) return;
      setLookupError(
        error instanceof Error && error.message === "lookup_timeout"
          ? "Lookup timed out. Check your connection and try again."
          : "Could not look up this user. Check your connection and try again.",
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (attempt === lookupAttempt.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (afu_id) {
      setAfuIdInput(afu_id);
      void lookupTarget(afu_id, "afu_id");
    } else if (handle) {
      void lookupTarget(handle, "handle");
    } else {
      lookupAttempt.current += 1;
      setTarget(null);
      setLookupError(null);
      setLoading(false);
    }
    return () => { lookupAttempt.current += 1; };
  }, [afu_id, handle, lookupTarget]);

  function clearTarget() {
    lookupAttempt.current += 1;
    setTarget(null);
    setLookupError(null);
    setLoading(false);
    setAfuIdInput("");
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
        <ScrollView
          contentContainerStyle={[s.lookupContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[s.lookupIcon, { backgroundColor: "#FF9500" + "18" }]}>
            <Ionicons name="person-outline" size={26} color="#FF9500" />
          </View>
          <Text style={[s.lookupTitle, { color: colors.text }]}>Request money</Text>
          <Text style={[s.lookupDescription, { color: colors.textMuted }]}>
            Enter the recipient’s 8-digit AfuChat ID to find them.
          </Text>
          <View style={[s.lookupInputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <TextInput
              appearance="embedded"
              style={[s.lookupInput, { color: colors.text }]}
              value={afuIdInput}
              onChangeText={(value) => {
                setAfuIdInput(value.replace(/\D/g, "").slice(0, 8));
                setLookupError(null);
              }}
              placeholder="AfuChat ID"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={8}
              returnKeyType="search"
              onSubmitEditing={() => void lookupTarget(afuIdInput, "afu_id")}
            />
          </View>
          {lookupError ? (
            <Text style={[s.lookupError, { color: "#FF453A" }]}>{lookupError}</Text>
          ) : null}
          <TouchableOpacity
            style={[s.lookupButton, { backgroundColor: colors.accent, opacity: afuIdInput.length ? 1 : 0.55 }]}
            onPress={() => void lookupTarget(afuIdInput, "afu_id")}
            disabled={!afuIdInput.length}
            activeOpacity={0.85}
          >
            <Ionicons name="search" size={17} color="#fff" />
            <Text style={s.lookupButtonText}>Find user</Text>
          </TouchableOpacity>
        </ScrollView>
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
          <View style={[s.card, { backgroundColor: colors.cardSurface, borderColor: colors.border }]}>
            <Avatar uri={target.avatar_url} name={target.display_name} size={54} />
            <View style={{ flex: 1 }}>
              <Text style={[s.name, { color: colors.text }]}>{target.display_name}</Text>
              <Text style={[s.handle, { color: colors.textMuted }]}>@{target.handle}</Text>
            </View>
            <TouchableOpacity onPress={clearTarget} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change recipient">
              <Text style={[s.changeTarget, { color: colors.accent }]}>Change</Text>
            </TouchableOpacity>
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
              appearance="embedded"
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
              appearance="embedded"
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
  lookupContent: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, gap: 12 },
  lookupIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  lookupTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 2 },
  lookupDescription: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 4 },
  lookupInputRow: { width: "100%", minHeight: 50, justifyContent: "center", borderRadius: 14, borderWidth: 1, paddingHorizontal: 16 },
  lookupInput: { width: "100%", minHeight: 48, fontSize: 18, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, textAlign: "center" },
  lookupError: { width: "100%", fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  lookupButton: { width: "100%", minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14 },
  lookupButtonText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  changeTarget: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
