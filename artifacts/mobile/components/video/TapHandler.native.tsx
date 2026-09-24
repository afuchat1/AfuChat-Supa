import React from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

type TapHandlerProps = {
  onTap: () => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: () => void;
};

/**
 * Native gesture layer for the video surface. The right action rail stays
 * outside the hit area so its buttons remain directly tappable.
 */
export default function TapHandler({
  onTap,
  onDoubleTap,
  onLongPress,
}: TapHandlerProps) {
  const singleTap = Gesture.Tap()
    .maxDuration(300)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd(() => { onTap(); });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd((event) => { onDoubleTap?.(event.x, event.y); });

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .runOnJS(true)
    .onStart(() => { onLongPress?.(); });

  const composed = Gesture.Race(
    longPress,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  return (
    <GestureDetector gesture={composed}>
      <View style={[StyleSheet.absoluteFill, { right: 80 }]} />
    </GestureDetector>
  );
}