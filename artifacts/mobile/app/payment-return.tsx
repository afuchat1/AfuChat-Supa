import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { safeRouter } from "@/lib/navUtils";
import { confirmWhopPayment } from "@/lib/whopPayments";
import type { WhopCheckoutPurpose } from "@/lib/whopPayments";

type PaymentState = "checking" | "confirmed" | "pending" | "submitted";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function PaymentReturnScreen() {
  const params = useLocalSearchParams<{
    session_id?: string | string[];
    provider?: string | string[];
    purpose?: string | string[];
  }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sessionId = first(params.session_id);
  const provider = first(params.provider).toLowerCase();
  const requestedPurpose = first(params.purpose) as WhopCheckoutPurpose | "";
  const [state, setState] = useState<PaymentState>("checking");
  const [purpose, setPurpose] = useState<WhopCheckoutPurpose | "">(requestedPurpose);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    if (!sessionId || (provider && provider !== "whop")) {
      setState("submitted");
      return () => { active = false; };
    }

    setState("checking");
    void confirmWhopPayment(sessionId)
      .then((result) => {
        if (!active) return;
        if (result.purpose) setPurpose(result.purpose);
        setState(result.confirmed ? "confirmed" : "pending");
      })
      .catch(() => {
        if (active) setState("pending");
      });
    return () => { active = false; };
  }, [provider, retryCount, sessionId]);

  const copy = useMemo(() => {
    if (state === "checking") {
      return {
        title: "Checking your payment",
        body: "We’re verifying the checkout with the payment provider. This may take a moment.",
        icon: "time-outline" as const,
        iconColor: "#258FE5",
      };
    }
    if (state === "confirmed") {
      return purpose === "donation"
        ? {
            title: "Thank you for your donation",
            body: "Your payment was verified successfully.",
            icon: "heart" as const,
            iconColor: "#34C759",
          }
        : {
            title: "Payment confirmed",
            body: "Your ACoin wallet has been updated.",
            icon: "checkmark-circle" as const,
            iconColor: "#34C759",
          };
    }
    if (state === "pending") {
      return {
        title: "Payment is still pending",
        body: "The provider has not confirmed this payment yet. Your wallet changes only after verification.",
        icon: "time-outline" as const,
        iconColor: "#E6A23C",
      };
    }
    return {
      title: "Payment submitted",
      body: "We received the checkout return, but could not verify it here. Check your wallet or donation status shortly.",
      icon: "information-circle-outline" as const,
        iconColor: "#258FE5",
    };
  }, [purpose, state]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.card, { backgroundColor: colors.cardSurface, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: `${copy.iconColor}18` }]}>
          {state === "checking"
            ? <ActivityIndicator color={copy.iconColor} size="large" />
            : <Ionicons name={copy.icon} size={38} color={copy.iconColor} />}
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{copy.body}</Text>

        {state === "pending" && sessionId ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setState("checking");
              setRetryCount((count) => count + 1);
            }}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryLabel, { color: colors.text }]}>Check again</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => safeRouter.replace(purpose === "donation" ? "/(tabs)/discover" : "/app/afupay")}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryLabel}>{purpose === "donation" ? "Continue to AfuChat" : "Go to wallet"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  icon: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 38,
    marginBottom: 20,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    lineHeight: 28,
    textAlign: "center",
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
  },
  primaryButton: {
    minHeight: 48,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#258FE5",
  },
  primaryLabel: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 44,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  secondaryLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
