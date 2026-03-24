import React from "react";
import { Image, StyleSheet } from "react-native";

const symbolImage = require("@/assets/images/afu-symbol.png");

interface Props {
  size?: number;
  color?: string;
}

/**
 * AfuChat brand icon — the logo symbol (no background).
 * Uses the original asset as a template image, tinted to the given color.
 * Active tab → brand teal; inactive tab → muted gray (controlled by caller via `color`).
 */
export default function AfuChatIcon({ size = 24, color = "#00C2CB" }: Props) {
  return (
    <Image
      source={symbolImage}
      style={[styles.icon, { width: size, height: size, tintColor: color }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  icon: {},
});
