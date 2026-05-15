import { Platform, StyleSheet } from "react-native";

// ─── Design tokens for the liquid glass system ────────────────────────────────
// Every surface, card, header, input, and sheet should reference these values
// to stay visually consistent across dark/light modes and platforms.

export const GLASS = {
  // ── Blur intensities ────────────────────────────────────────────────────────
  blur: {
    ultra:  100,   // modal overlays
    heavy:   80,   // primary surfaces
    medium:  60,   // cards and panels
    light:   40,   // secondary surfaces
    ultra_thin: 20, // floating badges
  },

  // ── Surface fill (rgba over the blur) ─────────────────────────────────────
  fill: {
    dark:         "rgba(22, 22, 26,  0.65)",
    darkMedium:   "rgba(28, 28, 32,  0.75)",
    darkStrong:   "rgba(16, 16, 20,  0.88)",
    light:        "rgba(255,255,255, 0.60)",
    lightMedium:  "rgba(255,255,255, 0.72)",
    lightStrong:  "rgba(255,255,255, 0.88)",
  },

  // ── Border (hairline specular edge) ───────────────────────────────────────
  border: {
    dark:         "rgba(255,255,255, 0.12)",
    darkSubtle:   "rgba(255,255,255, 0.07)",
    light:        "rgba(0,0,0,       0.07)",
    lightSubtle:  "rgba(0,0,0,       0.04)",
  },

  // ── Specular highlight gradient (top-edge shine) ──────────────────────────
  specular: {
    dark:  ["rgba(255,255,255,0.12)", "rgba(255,255,255,0.00)"] as [string, string],
    light: ["rgba(255,255,255,0.80)", "rgba(255,255,255,0.00)"] as [string, string],
  },

  // ── Shadows (platform-safe) ───────────────────────────────────────────────
  shadow: {
    dark: Platform.select({
      web: { boxShadow: "0 10px 28px rgba(0,0,0,0.50)" } as any,
      default: {
        shadowColor:   "#000000",
        shadowOpacity: 0.50,
        shadowRadius:  28,
        shadowOffset:  { width: 0, height: 10 },
        elevation:     16,
      },
    }),
    darkSoft: Platform.select({
      web: { boxShadow: "0 6px 16px rgba(0,0,0,0.30)" } as any,
      default: {
        shadowColor:   "#000000",
        shadowOpacity: 0.30,
        shadowRadius:  16,
        shadowOffset:  { width: 0, height: 6 },
        elevation:     10,
      },
    }),
    light: Platform.select({
      web: { boxShadow: "0 6px 20px rgba(0,0,0,0.10)" } as any,
      default: {
        shadowColor:   "#000000",
        shadowOpacity: 0.10,
        shadowRadius:  20,
        shadowOffset:  { width: 0, height: 6 },
        elevation:     8,
      },
    }),
    lightSoft: Platform.select({
      web: { boxShadow: "0 3px 12px rgba(0,0,0,0.06)" } as any,
      default: {
        shadowColor:   "#000000",
        shadowOpacity: 0.06,
        shadowRadius:  12,
        shadowOffset:  { width: 0, height: 3 },
        elevation:     4,
      },
    }),
  },

  // ── Radii ─────────────────────────────────────────────────────────────────
  radius: {
    xs:   8,
    sm:  12,
    md:  16,
    lg:  20,
    xl:  24,
    xxl: 32,
    pill:50,
  },
};

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Return the correct glass tokens for the current color scheme */
export function glassTokens(isDark: boolean) {
  return {
    fill:       isDark ? GLASS.fill.darkMedium  : GLASS.fill.lightMedium,
    fillStrong: isDark ? GLASS.fill.darkStrong  : GLASS.fill.lightStrong,
    fillSubtle: isDark ? GLASS.fill.dark        : GLASS.fill.light,
    border:     isDark ? GLASS.border.dark      : GLASS.border.light,
    borderSubtle: isDark ? GLASS.border.darkSubtle : GLASS.border.lightSubtle,
    specular:   isDark ? GLASS.specular.dark    : GLASS.specular.light,
    shadow:     isDark ? GLASS.shadow.dark      : GLASS.shadow.light,
    shadowSoft: isDark ? GLASS.shadow.darkSoft  : GLASS.shadow.lightSoft,
    blurTint:   (isDark
      ? "systemChromeMaterialDark"
      : "systemChromeMaterialLight") as any,
  };
}

/** BlurView tints optimised for each context */
export const BLUR_TINTS = {
  ios: {
    dark:        "systemChromeMaterialDark",
    light:       "systemChromeMaterialLight",
    ultraThin:   "systemUltraThinMaterial",
    thin:        "systemThinMaterial",
    regular:     "systemMaterial",
    thick:       "systemThickMaterial",
    chrome:      "systemChromeMaterial",
  } as const,
};

/** Standard glass separator hairline style */
export const glassSeparator = (isDark: boolean) => ({
  height: StyleSheet.hairlineWidth,
  backgroundColor: isDark ? GLASS.border.dark : GLASS.border.light,
});
