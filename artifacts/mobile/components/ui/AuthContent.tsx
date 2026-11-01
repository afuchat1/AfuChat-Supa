import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type AuthContentProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function AuthContent({ children, style }: AuthContentProps) {
  return <View style={[styles.content, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
});
