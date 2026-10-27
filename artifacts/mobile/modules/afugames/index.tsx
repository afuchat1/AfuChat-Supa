import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

/**
 * AfuGames module entry point.
 *
 * Build the new game inside this module. Keep game-specific screens, assets,
 * state, and components under modules/afugames; do not reintroduce legacy
 * routes under app/games.
 */
export default function AfuGamesApp() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
