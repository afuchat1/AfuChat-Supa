import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";

export type PaymentProvider = "whop" | "pesapal";

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
              accessibilityRole="radio"
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
                borderColor: selected ? "#1018D8" : colors.border,
                backgroundColor: selected ? "#1018D810" : colors.surface || colors.inputBg || "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
              }}
            >
              <Ionicons
                name={selected ? "radio-button-on" : "radio-button-off"}
                size={18}
                color={selected ? "#1018D8" : colors.textMuted}
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
