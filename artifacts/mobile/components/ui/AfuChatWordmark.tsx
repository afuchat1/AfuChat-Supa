import React from "react";
import { Text, type TextProps } from "react-native";
import { AFUCHAT_BRAND_NAME } from "@/lib/brandName";

type AfuChatWordmarkProps = Omit<TextProps, "children"> & {
  accentColor?: string;
};

export default function AfuChatWordmark({
  accentColor,
  style,
  ...props
}: AfuChatWordmarkProps) {
  return (
    <Text {...props} style={style}>
      {/* Runtime slices keep JSX localization from translating "Chat" separately. */}
      {AFUCHAT_BRAND_NAME.slice(0, 3)}
      <Text style={accentColor ? { color: accentColor } : undefined}>
        {AFUCHAT_BRAND_NAME.slice(3)}
      </Text>
    </Text>
  );
}
