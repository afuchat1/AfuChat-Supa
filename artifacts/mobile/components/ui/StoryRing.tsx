import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Colors from "@/constants/colors";

type Props = {
  size: number;
  storyCount: number;
  seenCount: number;
  children: React.ReactNode;
};

export function StoryRing({ size, storyCount, seenCount, children }: Props) {
  const strokeWidth = 2.5;
  const maxSegments = Math.min(storyCount, 30);
  const gap = maxSegments > 1 ? Math.min(6, (2 * Math.PI * ((size + strokeWidth * 2 + 4 - strokeWidth) / 2)) / (maxSegments * 3)) : 0;
  const outerSize = size + strokeWidth * 2 + 4;
  const radius = (outerSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = outerSize / 2;

  const hasUnseen = storyCount > seenCount;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (hasUnseen) {
      const anim = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 6000, useNativeDriver: true })
      );
      anim.start();
      return () => anim.stop();
    } else {
      spin.setValue(0);
    }
  }, [hasUnseen]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  if (storyCount === 0) {
    return <View style={{ padding: strokeWidth + 2 }}>{children}</View>;
  }

  const totalGapLength = gap * maxSegments;
  const availableLength = circumference - totalGapLength;
  const segmentLength = availableLength / maxSegments;
  const gapLength = maxSegments > 1 ? gap : 0;

  const segments = [];
  for (let i = 0; i < maxSegments; i++) {
    const isSeen = i < seenCount;
    const offset = i * (segmentLength + gapLength);
    segments.push(
      <Circle
        key={i}
        cx={center}
        cy={center}
        r={radius}
        stroke={isSeen ? "#8E8E93" : Colors.brand}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
        rotation={-90}
        origin={`${center}, ${center}`}
      />
    );
  }

  return (
    <View style={{ width: outerSize, height: outerSize, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: outerSize,
          height: outerSize,
          transform: hasUnseen ? [{ rotate }] : undefined,
        }}
      >
        <Svg width={outerSize} height={outerSize}>
          {segments}
        </Svg>
      </Animated.View>
      {children}
    </View>
  );
}
