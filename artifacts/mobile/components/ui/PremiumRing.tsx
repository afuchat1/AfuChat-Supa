import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Colors from "@/constants/colors";
import { useAppAccent } from "@/context/AppAccentContext";

type Props = {
  size: number;
  children: React.ReactNode;
};

export function PremiumRing({ size, children }: Props) {
  const { accent } = useAppAccent();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const spinAnim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 3200, useNativeDriver: true })
    );
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    spinAnim.start();
    pulseAnim.start();
    return () => { spinAnim.stop(); pulseAnim.stop(); };
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const ring = 2.5;
  const gap = 2;
  const outerSize = size + (ring + gap) * 2;
  const center = outerSize / 2;
  const radius = (outerSize - ring) / 2;
  const circumference = 2 * Math.PI * radius;
  const halfCirc = circumference / 2;
  const arcGap = 5;

  return (
    <Animated.View
      style={{
        width: outerSize,
        height: outerSize,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: pulse }],
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          width: outerSize,
          height: outerSize,
          transform: [{ rotate }],
        }}
      >
        <Svg width={outerSize} height={outerSize}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={Colors.gold}
            strokeWidth={ring}
            fill="none"
            strokeDasharray={`${halfCirc - arcGap} ${halfCirc + arcGap}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={accent}
            strokeWidth={ring}
            fill="none"
            strokeDasharray={`${halfCirc - arcGap} ${halfCirc + arcGap}`}
            strokeDashoffset={-(halfCirc)}
            strokeLinecap="round"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        </Svg>
      </Animated.View>
      <View style={{ position: "absolute" }}>
        {children}
      </View>
    </Animated.View>
  );
}
