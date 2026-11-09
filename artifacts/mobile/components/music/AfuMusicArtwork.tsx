import React, { useState } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  uri?: string | null;
  size: number;
  radius?: number;
  iconColor?: string;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function AfuMusicArtwork({
  uri,
  size,
  radius = Math.round(size * 0.24),
  iconColor = "#8D847B",
  backgroundColor = "#F1EDE8",
  style,
  accessibilityLabel = "Music artwork",
}: Props) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const hasArtwork = !!uri && failedUri !== uri;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.root,
        { width: size, height: size, borderRadius: radius, backgroundColor },
        style,
      ]}
    >
      {hasArtwork ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          onError={() => setFailedUri(uri ?? null)}
        />
      ) : (
        <Ionicons name="musical-notes" size={Math.max(16, size * 0.36)} color={iconColor} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
