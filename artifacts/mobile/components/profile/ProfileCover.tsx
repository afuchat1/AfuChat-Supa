import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { OptimizedImage } from "@/components/ui/OptimizedImage";

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  showTopFade?: boolean;
  fadeToColor?: string | null;
};

export function ProfileCover({
  uri,
  style,
  children,
  showTopFade = true,
  fadeToColor,
}: Props) {
  return (
    <View style={[styles.root, style]}>
      <OptimizedImage
        source={{ uri }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        style={StyleSheet.absoluteFill}
      />
      {showTopFade ? (
        <LinearGradient
          colors={["rgba(0,0,0,0.36)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.topFade]}
        />
      ) : null}
      {fadeToColor ? (
        <LinearGradient
          colors={["transparent", fadeToColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.bottomFade}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "relative" },
  topFade: { height: 72 },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
  },
});
