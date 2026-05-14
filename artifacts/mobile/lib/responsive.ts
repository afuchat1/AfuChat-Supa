/**
 * Responsive layout utilities for AfuChat.
 *
 * All helpers are based on the actual device screen dimensions at startup.
 * Use these instead of hardcoded pixel values so layouts adapt to any
 * phone or tablet without breaking.
 *
 * Hook equivalent: `useResponsive` (for components that need live updates
 * on orientation change).
 */

import { Dimensions, PixelRatio } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/**
 * Width percentage — convert a percentage of screen width to pixels.
 * @example wp(50)  // half the screen width
 */
export function wp(percentage: number): number {
  return (SCREEN_W * percentage) / 100;
}

/**
 * Height percentage — convert a percentage of screen height to pixels.
 * @example hp(20)  // 20% of screen height
 */
export function hp(percentage: number): number {
  return (SCREEN_H * percentage) / 100;
}

/**
 * Moderate scale — scales a size proportionally to the screen width,
 * but dampened by `factor` so extreme devices don't look weird.
 *
 * factor = 0   → fixed size (no scaling)
 * factor = 0.5 → half the normal linear scaling (default, recommended)
 * factor = 1   → full linear scaling
 *
 * Uses 375px (iPhone SE / most common small phone) as the reference.
 */
const REFERENCE_WIDTH = 375;

export function ms(size: number, factor = 0.5): number {
  const scaled = size + ((SCREEN_W / REFERENCE_WIDTH) - 1) * size * factor;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
}

/**
 * Normalize font size — like `ms` but tuned for typography (factor 0.35
 * ensures fonts don't scale too aggressively on large screens).
 */
export function nfs(size: number): number {
  return ms(size, 0.35);
}

/** Raw screen width in pixels. */
export const SW = SCREEN_W;

/** Raw screen height in pixels. */
export const SH = SCREEN_H;

/** True when device is likely a tablet (width ≥ 768px). */
export const isTablet = SCREEN_W >= 768;
