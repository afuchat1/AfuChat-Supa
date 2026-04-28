import { Platform, useWindowDimensions } from "react-native";

const DESKTOP_BREAKPOINT = 1024;

export function useIsDesktop() {
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  return { isDesktop, width, height };
}
