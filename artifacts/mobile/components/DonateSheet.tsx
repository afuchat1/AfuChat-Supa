// ─── DonateSheet ─────────────────────────────────────────────────────────────
// Bottom-sheet donation flow powered by Pesapal.
// Calls the existing `pesapal-initiate` edge function with
// { purpose: "donation", usd_amount: X } — the same checkout WebView
// pattern used by the ACoins top-up flow in modules/afupay.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { SUPABASE_EDGE_URL } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { useLanguage } from "@/context/LanguageContext";

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
  const insets = useSafeAreaInsets();

  const [selectedPreset, setSelectedPreset] = useState<number>(1); // default $5
  const [customAmt, setCustomAmt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [webLoading, setWebLoading] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

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
    try {
      const token = await getToken();
      const res = await fetch(`${SUPABASE_EDGE_URL}/pesapal-initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          purpose: "donation",
          usd_amount: usdAmount,
          // Fallback: some deployments read acoin_amount; map 1 USD → 100 units
          acoin_amount: Math.round(usdAmount * 100),
          currency: "USD",
        }),
      });
      const data = await res.json();
      if (data.redirect_url) {
        setCheckoutUrl(data.redirect_url);
      } else {
        setError(data.error || t("donate.error_checkout"));
        shake();
      }
    } catch {
      setError(t("donate.error_network"));
      shake();
    }
    setLoading(false);
  }

  function handleNavChange(nav: any) {
    const u: string = nav.url || "";
    if (
      u.includes("payment-complete") ||
      u.includes("payment_complete") ||
      u.includes("paymentcomplete")
    ) {
      setCheckoutUrl(null);
      setDone(true);
    }
  }

  function handleWebviewClose() {
    setCheckoutUrl(null);
  }

  function handleClose() {
    setSelectedPreset(1);
    setCustomAmt("");
    setError(null);
    setCheckoutUrl(null);
    setDone(false);
    onClose();
  }

  // ── Pesapal WebView modal ─────────────────────────────────────────────────
  if (checkoutUrl) {
    return (
      <Modal
        visible
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleWebviewClose}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={[s.webviewHeader, {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="lock-closed" size={13} color="#34C759" />
              <Text style={[s.webviewTitle, { color: colors.text }]}>{t("donate.checkout_title")}</Text>
              <View style={s.pesapalBadge}>
                <Text style={s.pesapalBadgeText}>Pesapal</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleWebviewClose} hitSlop={12} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          {webLoading && (
            <View style={{ height: 3, backgroundColor: ACCENT + "30" }}>
              <View style={{ width: "60%", height: 3, backgroundColor: ACCENT }} />
            </View>
          )}

          <WebView
            source={{ uri: checkoutUrl }}
            style={{ flex: 1, backgroundColor: colors.background }}
            onLoadStart={() => setWebLoading(true)}
            onLoadEnd={() => setWebLoading(false)}
            onNavigationStateChange={handleNavChange}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="large" color={ACCENT} />
                <Text style={{ marginTop: 12, color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }}>
                  {t("donate.loading_payment")}
                </Text>
              </View>
            )}
          />
          <View style={{ height: insets.bottom, backgroundColor: colors.background }} />
        </View>
      </Modal>
    );
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

        {/* Info blurb */}
        <View style={[s.infoBox, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={s.infoIcon}>
            <Ionicons name="shield-checkmark" size={14} color="#34C759" />
          </View>
          <Text style={[s.infoText, { color: colors.textMuted }]}>
            {t("donate.secure_checkout")}
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

  // WebView header
  webviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  webviewTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  pesapalBadge: {
    backgroundColor: "#34C75920",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pesapalBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#34C759",
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
