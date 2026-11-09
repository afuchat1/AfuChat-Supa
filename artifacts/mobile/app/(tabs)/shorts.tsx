/**
 * Shorts tab — full-screen video feed.
 * The video extends behind the floating pill tab bar.
 * A black fill covers the system navigation / home-indicator area at the bottom.
 */
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoFeed } from "@/app/video/[id]";

export default function ShortsTab() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VideoFeed isEmbedded />
      {/* Black padding that fills the system nav / home-indicator area */}
      {insets.bottom > 0 && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: insets.bottom,
            backgroundColor: "#000",
            pointerEvents: "none",
          }}
        />
      )}
    </View>
  );
}
