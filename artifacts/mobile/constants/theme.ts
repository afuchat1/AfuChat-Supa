/**
 * AfuChat Design Tokens — ONE source of truth for the entire platform.
 *
 * Every screen, component, and future module imports from here.
 * Never hard-code sizes, durations, or opacities in component files.
 *
 * Import: import { T } from "@/constants/theme";
 */

export const T = {

  // ── Typography scale ─────────────────────────────────────────────────────────
  // Size, weight, and spacing create hierarchy — no decorative flourishes.
  h1:         { fontSize: 28, fontFamily: "Inter_700Bold",     letterSpacing: -0.5, lineHeight: 34 },
  h2:         { fontSize: 22, fontFamily: "Inter_700Bold",     letterSpacing: -0.3, lineHeight: 28 },
  h3:         { fontSize: 19, fontFamily: "Inter_700Bold",     letterSpacing: -0.2, lineHeight: 24 },
  title:      { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: -0.2, lineHeight: 22 },
  body:       { fontSize: 15, fontFamily: "Inter_400Regular",  lineHeight: 22 },
  bodyMed:    { fontSize: 15, fontFamily: "Inter_500Medium",   lineHeight: 22 },
  bodySemi:   { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 22 },
  caption:    { fontSize: 13, fontFamily: "Inter_400Regular",  lineHeight: 18 },
  captionMed: { fontSize: 13, fontFamily: "Inter_500Medium",   lineHeight: 18 },
  label:      { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.7, lineHeight: 16 },
  micro:      { fontSize: 10, fontFamily: "Inter_500Medium",   lineHeight: 14 },

  // ── Spacing scale ────────────────────────────────────────────────────────────
  // Use multiples of 4 — keeps layouts aligned on a 4pt grid.
  space: {
    px:    1,
    xs:    4,
    sm:    8,
    md:   12,
    lg:   16,
    xl:   20,
    xxl:  24,
    xxxl: 32,
    huge: 48,
  },

  // ── Named layout shortcuts (preserve backwards-compat aliases) ───────────────
  pageH:    20,   // horizontal page padding
  itemV:    14,   // vertical padding inside list items
  sectionV: 24,   // vertical gap between page sections
  sepLeft:  54,   // left indent for separators under icon-label rows

  // ── Border radius ────────────────────────────────────────────────────────────
  // Use the smallest radius that feels natural for each component size.
  radius: {
    xs:    6,    // tight chips, inline badges
    sm:   10,    // small cards, icon wraps
    md:   14,    // standard cards, inputs, buttons
    lg:   18,    // modals, sheets, large cards
    xl:   22,    // hero surfaces
    xxl:  28,    // full-bleed panels
    pill: 999,   // pills, toggles, fully rounded buttons
  },

  // ── Icon list rows ───────────────────────────────────────────────────────────
  iconSize:  20,
  iconWrapW: 36,
  iconWrapH: 36,
  iconWrapR:  9,

  // ── Border widths ────────────────────────────────────────────────────────────
  border: {
    // RN Web warns for StyleSheet.hairlineWidth and renders fractional
    // separators inconsistently. Keep the token stable across platforms.
    hairline: 0.5,
    thin:     1,
    regular:  1.5,
    thick:    2,
  },

  // ── Motion ───────────────────────────────────────────────────────────────────
  // Shared durations and easing — import for Animated / Reanimated configs.
  motion: {
    // Durations in ms
    instant: 100,
    fast:    150,
    base:    250,
    slow:    380,
    // Cubic-bezier easing curves [x1, y1, x2, y2]
    easeOut:   [0.0, 0.0, 0.2, 1.0] as [number, number, number, number],
    easeIn:    [0.4, 0.0, 1.0, 1.0] as [number, number, number, number],
    easeInOut: [0.4, 0.0, 0.2, 1.0] as [number, number, number, number],
    // Spring presets for Reanimated withSpring()
    spring: {
      snappy:   { damping: 18, stiffness: 220, mass: 1 },
      bouncy:   { damping: 12, stiffness: 180, mass: 1 },
      gentle:   { damping: 22, stiffness: 160, mass: 1 },
    },
  },

  // ── Visual state opacities ───────────────────────────────────────────────────
  // Apply these consistently so every interactive element behaves the same.
  states: {
    disabled: 0.42,   // greyed-out; still readable
    pressed:  0.72,   // iOS-style press feedback
    loading:  0.60,   // skeleton / in-progress
    inactive: 0.50,   // secondary / unselected items
  },

  // ── Elevation / shadow presets ───────────────────────────────────────────────
  // Use the lowest elevation that separates the layer from its parent.
  elevation: {
    none:   0,
    subtle: 2,
    card:   4,
    sheet:  8,
    modal:  16,
    overlay:24,
  },

} as const;
