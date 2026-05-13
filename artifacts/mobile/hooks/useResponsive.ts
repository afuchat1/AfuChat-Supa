import { PixelRatio, useWindowDimensions } from "react-native";

export type ScreenSize = "tiny" | "small" | "medium" | "large" | "xlarge";

export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();

  const size: ScreenSize =
    width < 320 ? "tiny" :
    width < 375 ? "small" :
    width < 428 ? "medium" :
    width < 768 ? "large" :
    "xlarge";

  const isSmall = width < 375;
  const isTiny = width < 320;
  const isTablet = width >= 768;

  const scale = Math.max(0.75, Math.min(width / 390, 1.3));

  const hp = (pct: number) => (width * pct) / 100;
  const vp = (pct: number) => (height * pct) / 100;

  // Scales by both screen width and device accessibility font size
  const fontSize = (base: number) => {
    const widthScaled = Math.round(Math.max(base * 0.8, base * scale));
    return Math.round(widthScaled * Math.min(fontScale, 1.4));
  };

  const spacing = (base: number) => Math.round(base * scale);

  const gridColumns = (idealWidth: number, gap: number, pad: number) => {
    const available = width - pad * 2;
    const cols = Math.max(1, Math.floor((available + gap) / (idealWidth + gap)));
    const itemW = (available - gap * (cols - 1)) / cols;
    return { cols, itemWidth: itemW };
  };

  return {
    width,
    height,
    size,
    scale,
    fontScale,
    isSmall,
    isTiny,
    isTablet,
    hp,
    vp,
    fontSize,
    spacing,
    gridColumns,
  };
}
