import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTelegram } from "@/context/TelegramContext";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function useTelegramSafeArea(): SafeAreaInsets {
  const nativeInsets = useSafeAreaInsets();
  const { isTelegram, safeAreaInset, contentSafeAreaInset } = useTelegram();

  if (!isTelegram) return nativeInsets;

  return {
    top: Math.max(safeAreaInset.top, contentSafeAreaInset.top),
    bottom: Math.max(safeAreaInset.bottom, contentSafeAreaInset.bottom),
    left: Math.max(safeAreaInset.left, contentSafeAreaInset.left),
    right: Math.max(safeAreaInset.right, contentSafeAreaInset.right),
  };
}

export function useTelegramViewportHeight(): number {
  const { isTelegram, viewportHeight } = useTelegram();
  if (!isTelegram || viewportHeight === 0) {
    if (typeof window !== "undefined") return window.innerHeight;
    return 0;
  }
  return viewportHeight;
}
