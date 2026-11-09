import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { useTheme } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (method: "whatsapp" | "telegram" | "sms") => void;
};

export default function InviteOptionsSheet({ visible, onClose, onSelect }: Props) {
  const { colors } = useTheme();
  const options = [
    { method: "whatsapp" as const, label: "WhatsApp", icon: "logo-whatsapp" as const },
    { method: "telegram" as const, label: "Telegram", icon: "paper-plane" as const },
    { method: "sms" as const, label: "SMS", icon: "chatbubble" as const },
  ];

  return (
    <SwipeableBottomSheet
      visible={visible}
      onClose={onClose}
      maxHeight={360}
      backgroundColor={colors.surface}
    >
      <View style={{ padding: 20, gap: 12 }}>
        <View style={{ alignItems: "center", gap: 5, marginBottom: 2 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.separator }} />
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold" }}>
            Invite via
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" }}>
            Choose where to send your AfuChat invite
          </Text>
        </View>
        {options.map(({ method, label, icon }) => (
          <TouchableOpacity
            key={method}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.accent,
            }}
            onPress={() => {
              onClose();
              onSelect(method);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name={icon} size={22} color="#fff" />
            <Text style={{ flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>
              {label}
            </Text>
            <Ionicons name="chevron-forward" size={19} color="#fff" />
          </TouchableOpacity>
        ))}
      </View>
    </SwipeableBottomSheet>
  );
}