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
        resizeMode="cover"
        accessibilityLabel="Whop logo"
        style={{ width: 30, height: 30, borderRadius: 7 }}
      />
    );
  }

  return (
    <Image
      source={require("../assets/images/payment/pesapal-logo.png")}
      resizeMode="contain"
      accessibilityLabel="Pesapal logo"
      style={{ width: 58, height: 28 }}
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
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
        PAYMENT METHOD
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {([
          ["whop", "Whop", "Default"],
          ["pesapal", "Pesapal", "Optional"],
        ] as const).map(([provider, label, note]) => {
          const selected = value === provider;
          return (
            <TouchableOpacity
              key={provider}
              testID={`payment-provider-${provider}`}
              accessibilityRole="radio"
              accessibilityLabel={`${label}, ${note}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(provider)}
              activeOpacity={0.8}
              style={{
                flex: 1,
                minHeight: 58,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 12,
                borderWidth: selected ? 1.5 : 1,
                 borderColor: selected ? Colors.brand : colors.border,
                 backgroundColor: selected ? Colors.brand + "10" : colors.surface || colors.inputBg || "transparent",
                flexDirection: "row",
                alignItems: "center",
                 gap: 8,
              }}
            >
               <View
                 style={{
                   width: provider === "whop" ? 34 : 62,
                   height: 34,
                   borderRadius: 8,
                   backgroundColor: "#FFFFFF",
                   alignItems: "center",
                   justifyContent: "center",
                   flexShrink: 0,
                 }}
               >
                 <PaymentProviderLogo provider={provider} />
               </View>
              <Ionicons
                name={selected ? "radio-button-on" : "radio-button-off"}
                size={18}
                 color={selected ? Colors.brand : colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                  {label}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                  {note}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
