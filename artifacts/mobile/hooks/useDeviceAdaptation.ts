import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardContext } from "@/components/KeyboardControllerCompat";
import { classifyWindowWidth } from "@/lib/deviceLayout";

export function useDeviceAdaptation() {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const { reanimated: keyboard } = useKeyboardContext();

  return {
    platform: Platform.OS,
    platformVersion: Platform.Version,
    window: {
      width,
      height,
      scale,
      fontScale,
      widthClass: classifyWindowWidth(width),
      orientation: width > height ? "landscape" as const : "portrait" as const,
    },
    safeAreaInsets,
    keyboard,
  };
}
