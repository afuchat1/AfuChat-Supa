import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export default function UpdatePasswordNative() {
  const { colors } = useTheme();
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <Ionicons name="lock-closed" size={48} color={colors.textMuted} style={{ marginBottom: 16 }} />
      <Text style={[s.title, { color: colors.text }]}>Password Reset</Text>
      <Text style={[s.body, { color: colors.textMuted }]}>
        To reset your password, please use the AfuChat mobile app — tap "Forgot password?" on the sign-in screen.
      </Text>
      <TouchableOpacity
        style={[s.btn, { backgroundColor: colors.accent }]}
        onPress={() => router.replace("/(auth)/login" as any)}
        activeOpacity={0.85}
      >
        <Text style={s.btnTxt}>Go to sign-in</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, maxWidth: 320 },
  btn: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 14 },
  btnTxt: { color: "#000", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
