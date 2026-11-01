// ─── AfuChat Brand Identity ───────────────────────────────────────────────────
// ONE source of truth for all color decisions.
// Import `Colors` (default) for raw palette values.
// Import `useTheme()` for the live, resolved theme object inside components.

// Sampled from the dominant blue in the supplied AfuChat app icon.
const BRAND        = "#1018D8";   // primary brand — all interactive elements
const BRAND_DARK   = "#0B10A8";   // pressed / darker variant of brand
const BRAND_BLUE   = "#1018D8";   // compatibility alias for the icon blue
const GOLD         = "#D4A853";   // prestige / premium / ACoin

// ─── Semantic status palette (theme-independent) ──────────────────────────────
// These never change between light/dark — they carry universal meaning.
export const STATUS = {
  success:        "#34C759",   // green  — completed, confirmed, healthy
  successSubtle:  "#34C75920",
  warning:        "#FF9F0A",   // amber  — caution, pending, degraded
  warningSubtle:  "#FF9F0A20",
  error:          "#FF3B30",   // red    — failure, danger, destructive
  errorSubtle:    "#FF3B3020",
  info:           "#5AC8FA",   // sky    — informational, neutral notice
  infoSubtle:     "#5AC8FA20",
} as const;

// ─── Theme palettes ───────────────────────────────────────────────────────────
// Semantic names only — no raw hex strings in component code.

const light = {
  // ── Typography ──────────────────────────────────────────────────────────────
  text:              "#000000",
  textSecondary:     "#5A5040",
  textMuted:         "#8C7F6A",

  // ── Backgrounds — flat UI: one universal BG, no card elevation ──────────────
  background:        "#F5F0E8",   // page / screen
  backgroundSecondary: "#F5F0E8", // same — no layering
  backgroundTertiary:  "#F5F0E8", // same — no layering
  surface:           "#F5F0E8",   // elevated surfaces
  card:              "#F5F0E8",

  // ── Lines ───────────────────────────────────────────────────────────────────
  border:            "#DDD7C9",
  separator:         "#DDD7C9",

  // ── Interactive ─────────────────────────────────────────────────────────────
  accent:            BRAND,
  tint:              BRAND,
  tabIconDefault:    "#8C7F6A",
  tabIconSelected:   BRAND,

  // ── Icons ───────────────────────────────────────────────────────────────────
  icon:              "#4A4035",
  iconMuted:         "#8C7F6A",

  // ── Chat bubbles ────────────────────────────────────────────────────────────
  bubble:            BRAND,
  bubbleText:        "#FFFFFF",
  bubbleIncoming:    "#EDE8DC",
  bubbleIncomingText:"#1A1208",

  // ── Form inputs ─────────────────────────────────────────────────────────────
  inputBg:           "#EDE8DC",

  // ── Glass surface tokens (light equivalents — subtle shadows) ────────────────
  glassBg:           "rgba(0,0,0,0.05)",
  glassBgSubtle:     "rgba(0,0,0,0.03)",

  // ── Navigation ──────────────────────────────────────────────────────────────
  header:            "#F5F0E8",
  navigationSurface: "#F5F0E8",
  navigationBorder:  "#DDD7C9",
  navigationActive:  BRAND,
  navigationInactive: "#8C7F6A",

  // ── Badges ──────────────────────────────────────────────────────────────────
  badgeBg:           STATUS.error,
  badgeText:         "#FFFFFF",

  // ── Presence ────────────────────────────────────────────────────────────────
  online:            BRAND,
  unread:            BRAND,
  avatar:            "#DDD7C9",

  // ── Semantic status (reflected from STATUS for component convenience) ────────
  success:           STATUS.success,
  successSubtle:     STATUS.successSubtle,
  warning:           STATUS.warning,
  warningSubtle:     STATUS.warningSubtle,
  error:             STATUS.error,
  errorSubtle:       STATUS.errorSubtle,
  info:              STATUS.info,
  infoSubtle:        STATUS.infoSubtle,
} as const;

const dark = {
  // ── Typography ──────────────────────────────────────────────────────────────
  text:              "#E8EAED",
  textSecondary:     "#BDC1C6",
  textMuted:         "#9AA0A6",

  // ── Backgrounds — flat UI: one universal BG, no card elevation ──────────────
  background:        "#202124",
  backgroundSecondary: "#202124", // AfuSearch's shared dark surface
  backgroundTertiary:  "#202124", // same — no layering
  surface:           "#202124",
  card:              "#202124",

  // ── Lines ───────────────────────────────────────────────────────────────────
  border:            "#3C4043",
  separator:         "rgba(255,255,255,0.08)",

  // ── Interactive ─────────────────────────────────────────────────────────────
  accent:            BRAND,
  tint:              BRAND,
  tabIconDefault:    "#717171",
  tabIconSelected:   BRAND,

  // ── Icons ───────────────────────────────────────────────────────────────────
  icon:              "#BDC1C6",
  iconMuted:         "#9AA0A6",

  // ── Chat bubbles ────────────────────────────────────────────────────────────
  bubble:            BRAND,
  bubbleText:        "#FFFFFF",
  bubbleIncoming:    "#303134",
  bubbleIncomingText:"#E8EAED",

  // ── Form inputs — glass style matching auth screens ──────────────────────────
  inputBg:           "#303134",

  // ── Glass surface tokens (match login / welcome glass aesthetic) ─────────────
  glassBg:           "rgba(255,255,255,0.08)",
  glassBgSubtle:     "rgba(255,255,255,0.05)",

  // ── Navigation ──────────────────────────────────────────────────────────────
  header:            "#202124",
  navigationSurface: "#202124",
  navigationBorder:  "#3C4043",
  navigationActive:  "#FFF8F0",
  navigationInactive: "#B9BAC4",

  // ── Badges ──────────────────────────────────────────────────────────────────
  badgeBg:           STATUS.error,
  badgeText:         "#FFFFFF",

  // ── Presence ────────────────────────────────────────────────────────────────
  online:            BRAND,
  unread:            BRAND,
  avatar:            "#303134",

  // ── Semantic status (reflected from STATUS for component convenience) ────────
  success:           STATUS.success,
  successSubtle:     STATUS.successSubtle,
  warning:           STATUS.warning,
  warningSubtle:     STATUS.warningSubtle,
  error:             STATUS.error,
  errorSubtle:       STATUS.errorSubtle,
  info:              STATUS.info,
  infoSubtle:        STATUS.infoSubtle,
} as const;

export default {
  // ── Raw brand palette ───────────────────────────────────────────────────────
  brand:      BRAND,
  brandDark:  BRAND_DARK,
  blue:       BRAND_BLUE,
  gold:       GOLD,

  // ── Status (theme-independent) ──────────────────────────────────────────────
  status:     STATUS,

  // ── Theme palettes ──────────────────────────────────────────────────────────
  light,
  dark,
};
