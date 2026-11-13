import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image, Text, TouchableOpacity, View } from "react-native";
import Colors from "@/constants/colors";

export type PaymentProvider = "whop" | "pesapal";

export function PaymentProviderLogo({ provider }: { provider: PaymentProvider }) {
  if (provider === "whop") {
    return (
      <Image
        source={require("../assets/images/payment/whop-icon.png")}
        resizeMode="contain"
        accessibilityLabel="Whop logo"
        style={{ width: 32, height: 32 }}
      />
    );
  }

  return (
    <Image
      source={require("../assets/images/payment/pesapal-logo.png")}
      resizeMode="contain"
      accessibilityLabel="Pesapal logo"
      style={{ width: 76, height: 24 }}
    />
  );
}

export function PaymentProviderPicker({
  value,
  onChange,
  colors,
}: {
  value: PaymentProvider;
  onChange: (provider: PaymentProvider) => void;
  colors: { text: string; textMuted: string; border: string; surface?: string; inputBg?: string };
}) {
  return (
    <View>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 }}>
        PAYMENT METHOD
      </Text>
      <View style={{ marginTop: 4 }}>
        {([
          ["whop", "Whop"],
          ["pesapal", "Pesapal"],
        ] as const).map(([provider, label], index, providers) => {
          const selected = value === provider;
          return (
            <TouchableOpacity
              key={provider}
              testID={`payment-provider-${provider}`}
              accessibilityRole="radio"
              accessibilityLabel={`${label} payment provider`}
              accessibilityHint={selected ? "Selected" : "Tap to choose this payment provider"}
              accessibilityState={{ selected }}
              onPress={() => onChange(provider)}
              activeOpacity={0.8}
              style={{
                minHeight: 64,
                paddingHorizontal: 2,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderBottomWidth: index < providers.length - 1 ? 0.5 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ width: 84, height: 38, alignItems: "flex-start", justifyContent: "center", flexShrink: 0 }}>
                <PaymentProviderLogo provider={provider} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: selected ? Colors.brand : colors.text, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                  {label}
                </Text>
              </View>
              <Ionicons
                name={selected ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={selected ? Colors.brand : colors.textMuted}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
