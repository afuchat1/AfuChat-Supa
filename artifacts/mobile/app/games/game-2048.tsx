import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function Game2048() {
  const router = useRouter();
  return (
    <View style={s.root}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <Ionicons name="grid-outline" size={64} color="#00BCD4" />
      <Text style={s.title}>2048</Text>
      <Text style={s.sub}>Coming soon</Text>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center", gap: 12 },
  back: { position: "absolute", top: 56, left: 20 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.4)", fontSize: 15 },
});
