import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet } from "react-native";

type TapHandlerProps = {
  onTap: () => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: () => void;
};

/**
 * Web/static-render fallback. Avoid importing the native gesture package into
 * Expo's Node renderer, where its native class graph is not available.
 */
export default function TapHandler({
  onTap,
  onDoubleTap,
  onLongPress,
}: TapHandlerProps) {
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAt = useRef(0);

  useEffect(() => () => {
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
  }, []);

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, { right: 80 }]}
      onPress={(event) => {
        const now = Date.now();
        const isDoubleTap = now - lastTapAt.current < 280;
        lastTapAt.current = isDoubleTap ? 0 : now;
        if (isDoubleTap) {
          if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
          singleTapTimer.current = null;
          onDoubleTap?.(event.nativeEvent.locationX, event.nativeEvent.locationY);
          return;
        }
        singleTapTimer.current = setTimeout(() => {
          singleTapTimer.current = null;
          onTap();
        }, 280);
      }}
      onLongPress={onLongPress}
      delayLongPress={500}
    />
  );
}