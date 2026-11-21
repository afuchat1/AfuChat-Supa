// ─── DonateSheet ─────────────────────────────────────────────────────────────
// Bottom-sheet donation flow powered by Pesapal.
// Calls the existing `pesapal-initiate` edge function with
// { purpose: "donation", usd_amount: X }; hosted checkouts open externally.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/AfuTextInput";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { SUPABASE_EDGE_URL } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { useLanguage } from "@/context/LanguageContext";
import { PaymentProviderPicker, type PaymentProvider } from "@/components/PaymentProviderPicker";
import { confirmWhopPayment, startWhopCheckout } from "@/lib/whopPayments";
import { openExternalLink } from "@/lib/openExternalLink";

const ACCENT = Colors.brand;

// ─── Preset donation tiers ────────────────────────────────────────────────────

const PRESETS = [
  { labelKey: "donate.preset_coffee",   usd: 1 },
  { labelKey: "donate.preset_servers",  usd: 5 },
  { labelKey: "donate.preset_features", usd: 10 },
  { labelKey: "donate.preset_champion", usd: 25 },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed.session?.access_token) return refreshed.session.access_token;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? "";
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DonateSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function DonateSheet({ visible, onClose }: DonateSheetProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  const [selectedPreset, setSelectedPreset] = useState<number>(1); // default $5
  const [customAmt, setCustomAmt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [provider, setProvider] = useState<PaymentProvider>("whop");
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const wasBackgrounded = useRef(false);
  const confirmingOnResume = useRef(false);

  useEffect(() => {
    if (!checkoutUrl) return;
    const url = checkoutUrl;
    setCheckoutUrl(null);
    void openExternalLink(url).catch((launchError) => {
      setCheckoutSessionId(null);
      setError(launchError instanceof Error ? launchError.message : "Could not open the payment page. Please try again.");
    });
  }, [checkoutUrl]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        wasBackgrounded.current = true;
        return;
      }
      if (!wasBackgrounded.current) return;
      wasBackgrounded.current = false;
      const sessionId = checkoutSessionId;
      if (!visible || provider !== "whop" || !sessionId || confirmingOnResume.current) return;
      confirmingOnResume.current = true;
      void confirmWhopPayment(sessionId)
        .then((result) => {
          if (!result.confirmed) return;
          setCheckoutSessionId(null);
          setDone(true);
        })
        .catch(() => {})
        .finally(() => {
          confirmingOnResume.current = false;
        });
    });
    return () => subscription.remove();
  }, [checkoutSessionId, provider, visible]);

  const usdAmount =
    customAmt !== ""
      ? parseFloat(customAmt) || 0
      : PRESETS[selectedPreset].usd;

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 6,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function handleDonate() {
    setError(null);
    if (usdAmount < 1) {
      setError(t("donate.error_minimum", { amount: 1 }));
      shake();
      return;
    }
    setLoading(true);
    setCheckoutSessionId(null);
    try {
      if (provider === "whop") {
        const result = await startWhopCheckout({ purpose: "donation", usd_amount: usdAmount });
        setCheckoutSessionId(result.session_id);
        setCheckoutUrl(result.purchase_url);
      } else {
        const token = await getToken();
        const res = await fetch(`${SUPABASE_EDGE_URL}/pesapal-initiate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            purpose: "donation",
            usd_amount: usdAmount,
            acoin_amount: Math.round(usdAmount * 100),
            currency: "USD",
          }),
        });
        const data = await res.json();
        if (data.redirect_url) {
          setCheckoutSessionId(null);
          setCheckoutUrl(data.redirect_url);
        } else {
          setError(data.error || t("donate.error_checkout"));
          shake();
        }
      }
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : t("donate.error_network"));
      shake();
    }
    setLoading(false);
  }

  function handleClose() {
    setSelectedPreset(1);
    setCustomAmt("");
    setError(null);
    setCheckoutUrl(null);
    setDone(false);
    setCheckoutSessionId(null);
    setProvider("whop");
    onClose();
  }

  // ── Thank-you state ───────────────────────────────────────────────────────
  if (done) {
    return (
      <SwipeableBottomSheet
        visible={visible}
        onClose={handleClose}
        backgroundColor={colors.card}
        maxHeight="92%"
      >
        <View style={s.sheetContent}>
          <View style={s.thankYouContent}>
            <View style={[s.thankYouIcon, { backgroundColor: "#34C75918" }]}>
              <Ionicons name="heart" size={38} color="#34C759" />
            </View>
            <Text style={[s.thankYouTitle, { color: colors.text }]}>
              {t("donate.thank_you_title")}
            </Text>
            <Text style={[s.thankYouSub, { color: colors.textMuted }]}>
              {t("donate.thank_you_sub")}
            </Text>
            <TouchableOpacity
              style={[s.donateBtn, { backgroundColor: ACCENT, marginTop: 8 }]}
              onPress={handleClose}
              activeOpacity={0.85}
            >
              <Text style={s.donateBtnText}>{t("donate.close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SwipeableBottomSheet>
    );
  }

  // ── Picker sheet ──────────────────────────────────────────────────────────
  return (
    <SwipeableBottomSheet
      visible={visible}
      onClose={handleClose}
      backgroundColor={colors.card}
      maxHeight="92%"
    >
      <View style={s.sheetContent}>
        {/* Title row */}
        <View style={s.titleRow}>
          <View style={[s.heartBadge, { backgroundColor: "#FF3B3018" }]}>
            <Ionicons name="heart" size={18} color="#FF3B30" />
          </View>
          <View style={s.titleCopy}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>{t("donate.support_title")}</Text>
            <Text style={[s.sheetSub, { color: colors.textMuted }]}>
              {t("donate.support_subtitle")}
            </Text>
          </View>
          <TouchableOpacity onPress={handleClose} hitSlop={12} style={s.closeBtn}>
            <Ionicons name="close-circle" size={26} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Preset grid */}
        <View style={s.presetGrid}>
          {PRESETS.map((p, i) => {
            const isSelected = customAmt === "" && selectedPreset === i;
            return (
              <TouchableOpacity
                key={i}
                style={[
                  s.presetCard,
                  { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                  isSelected && { backgroundColor: ACCENT + "15", borderColor: ACCENT },
                ]}
                onPress={() => { setSelectedPreset(i); setCustomAmt(""); setError(null); }}
                activeOpacity={0.75}
              >
                <Text style={[s.presetAmt, { color: isSelected ? ACCENT : colors.text }]}>
                  ${p.usd}
                </Text>
                <Text style={[s.presetLabel, { color: isSelected ? ACCENT : colors.textMuted }]}>
                  {t(p.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom amount */}
        <View style={s.customRow}>
          <Text style={[s.customLabel, { color: colors.textMuted }]}>{t("donate.custom_amount")}</Text>
          <View style={[
            s.customInput,
            { backgroundColor: colors.backgroundSecondary, borderColor: customAmt !== "" ? ACCENT : colors.border },
          ]}>
            <Text style={[s.customCurrency, { color: colors.textMuted }]}>$</Text>
            <TextInput
              appearance="embedded"
              style={[s.customInputText, { color: colors.text }]}
              value={customAmt}
              onChangeText={(t) => { setCustomAmt(t.replace(/[^0-9.]/g, "")); setError(null); }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
            />
          </View>
        </View>

        <View style={{ marginTop: 12, marginBottom: 8 }}>
          <PaymentProviderPicker value={provider} onChange={setProvider} colors={colors} />
        </View>

        {/* Info blurb */}
        <View style={[s.infoBox, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={s.infoIcon}>
            <Ionicons name="shield-checkmark" size={14} color="#34C759" />
          </View>
          <Text style={[s.infoText, { color: colors.textMuted }]}>
            {provider === "whop"
              ? "Secure hosted checkout via Whop. Your donation is recorded only after payment confirmation."
              : t("donate.secure_checkout")}
          </Text>
        </View>

        {/* Error */}
        {error && (
          <Animated.View
            style={[s.errorBox, { transform: [{ translateX: shakeAnim }] }]}
          >
            <Ionicons name="warning" size={14} color="#FF3B30" />
            <Text style={s.errorText}>{error}</Text>
          </Animated.View>
        )}

        {/* Donate button */}
        <TouchableOpacity
          style={[
            s.donateBtn,
            { backgroundColor: loading ? ACCENT + "80" : ACCENT, marginHorizontal: 0 },
          ]}
          onPress={handleDonate}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View style={s.donateContent}>
              <View style={s.donateIcon}>
                <Ionicons name="heart" size={17} color="#fff" />
              </View>
              <Text style={s.donateBtnText}>
                {t("donate.button", {
                  amount: usdAmount >= 1 ? usdAmount.toFixed(usdAmount % 1 === 0 ? 0 : 2) : "N/A",
                })}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </SwipeableBottomSheet>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sheetContent: {
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  heartBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sheetTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: "Inter_700Bold",
  },
  sheetSub: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  presetGrid: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  presetCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    paddingVertical: 14,
    gap: 4,
  },
  presetAmt: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  presetLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  customRow: {
    gap: 8,
    marginBottom: 4,
  },
  customLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  customInput: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    height: 48,
    gap: 4,
  },
  customCurrency: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  customInputText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  infoIcon: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    includeFontPadding: false,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  donateBtn: {
    borderRadius: 16,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 0,
  },
  donateBtnText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    includeFontPadding: false,
  },
  donateContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  donateIcon: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Thank-you
  thankYouContent: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 14,
    paddingHorizontal: 8,
  },
  thankYouIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  thankYouTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  thankYouSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
});
