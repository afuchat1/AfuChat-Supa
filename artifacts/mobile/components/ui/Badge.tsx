import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = { count: number };

export function Badge({ count }: Props) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <View style={[styles.badge, label.length > 2 && styles.wide]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  wide: { borderRadius: 10 },
  text: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 13,
  },
});
