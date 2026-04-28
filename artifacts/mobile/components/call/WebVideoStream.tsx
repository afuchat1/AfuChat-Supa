import React, { useEffect, useRef } from "react";
import { Platform, View, ViewStyle } from "react-native";

export function WebVideoStream({
  stream,
  style,
  mirror = false,
  muted = false,
}: {
  stream: any;
  style?: ViewStyle | ViewStyle[];
  mirror?: boolean;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const v = videoRef.current;
    if (!v) return;
    if (stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    } else if (!stream) {
      v.srcObject = null;
    }
  }, [stream]);

  if (Platform.OS !== "web") return null;

  return (
    <View style={style as any}>
      {React.createElement("video", {
        ref: videoRef,
        autoPlay: true,
        playsInline: true,
        muted,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: mirror ? "scaleX(-1)" : undefined,
        },
      })}
    </View>
  );
}
