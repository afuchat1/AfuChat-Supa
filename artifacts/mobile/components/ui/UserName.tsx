import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { useUserEffects } from "@/hooks/useUserEffects";

const LIGHT_METALLIC_GOLD = [
  "#704607",
  "#98620C",
  "#A96F0F",
  "#80530A",
  "#AA7519",
  "#704607",
] as const;

const DARK_METALLIC_GOLD = [
  "#E7B73C",
  "#F7D971",
  "#FFF4C5",
  "#D9A726",
  "#FFF0A8",
  "#ECC64F",
] as const;

const CompatibleMaskedView = MaskedView as unknown as React.ComponentType<any>;

type Props = {
  userId: string | null | undefined;
  name: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  suppressStar?: boolean;
};

const styles = StyleSheet.create({
  emphasizedName: {
    fontFamily: "Inter_700Bold",
  },
  maskedView: {
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  shine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 26,
  },
  shineGradient: {
    flex: 1,
  },
});

export default function UserName({
  userId,
  name,
  style,
  numberOfLines,
  suppressStar = false,
}: Props) {
  const { isDark } = useTheme();
  const { goldNameplate, verifiedStar } = useUserEffects(userId);
  const shimmer = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);
  const shownName = `${name}${!suppressStar && verifiedStar ? " ⭐" : ""}`;
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setTextWidth((current) => Math.abs(current - nextWidth) > 1 ? nextWidth : current);
  }, []);

  useEffect(() => {
    if (!goldNameplate) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(650),
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1350,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(1750),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [goldNameplate, shimmer]);

  if (goldNameplate) {
    const translateX = shimmer.interpolate({
      inputRange: [0, 1],
      outputRange: [-34, Math.max(textWidth, 44) + 34],
    });
    const viewStyle = style as StyleProp<ViewStyle>;

    return (
      <CompatibleMaskedView
        onLayout={handleLayout}
        style={[viewStyle, styles.maskedView]}
        maskElement={
          <Text style={[style, styles.emphasizedName, { color: "#FFFFFF", backgroundColor: "transparent" }]} numberOfLines={numberOfLines}>
            {shownName}
          </Text>
        }
      >
        <LinearGradient
          colors={isDark ? DARK_METALLIC_GOLD : LIGHT_METALLIC_GOLD}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
        >
          <Text style={[style, styles.emphasizedName, { color: "transparent" }]} numberOfLines={numberOfLines}>
            {shownName}
          </Text>
        </LinearGradient>
        <Animated.View
          pointerEvents="none"
          style={[styles.shine, { transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={["transparent", "rgba(255, 249, 216, 0.28)", "#FFFFFF", "rgba(255, 231, 139, 0.62)", "transparent"]}
            locations={[0, 0.2, 0.5, 0.78, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.shineGradient}
          />
        </Animated.View>
      </CompatibleMaskedView>
    );
  }

  return (
    <Text
      style={[style, styles.emphasizedName]}
      numberOfLines={numberOfLines}
    >
      {shownName}
    </Text>
  );
}
