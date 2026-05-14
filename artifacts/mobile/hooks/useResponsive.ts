import { PixelRatio, useWindowDimensions } from "react-native";

export type ScreenSize = "tiny" | "small" | "medium" | "large" | "xlarge";

/**
 * Responsive hook — returns live screen dimensions and layout helpers.
 * Re-renders automatically when the device rotates or window resizes.
 *
 * For static StyleSheet values (outside components) use `lib/responsive.ts`.
 */
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

  // Scale relative to 375px (iPhone SE — the smallest common phone).
  // Clamped to [0.8, 1.35] so layouts never shrink/grow too aggressively.
  const REFERENCE_WIDTH = 375;
  const scale = Math.max(0.8, Math.min(width / REFERENCE_WIDTH, 1.35));

  /** Width percentage */
  const wp = (pct: number) => (width * pct) / 100;
  /** Height percentage */
  const vp = (pct: number) => (height * pct) / 100;

  /** Moderate scale — scales size by screen width, dampened by factor */
  const ms = (base: number, factor = 0.5) => {
    const scaled = base + (width / REFERENCE_WIDTH - 1) * base * factor;
    return Math.round(PixelRatio.roundToNearestPixel(scaled));
  };

  /** Normalize font size — ms() tuned for typography */
  const fontSize = (base: number) => {
    const widthScaled = ms(base, 0.35);
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
    wp,
    vp,
    ms,
    fontSize,
    spacing,
    gridColumns,
  };
}
