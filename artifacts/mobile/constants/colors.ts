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
  textSecondary:     "#4F493F",
  textMuted:         "#625B50",

  // ── Backgrounds — warm canvas with clearly separated surfaces ───────────────
  background:        "#F0EBE1",   // page / screen
  backgroundSecondary: "#E8E1D5",
  backgroundTertiary:  "#DED7CA",
  surface:           "#FFFEFA",   // elevated surfaces
  card:              "#FFFFFF",

  // ── Lines ───────────────────────────────────────────────────────────────────
  border:            "transparent",
  separator:         "transparent",

  // ── Interactive ─────────────────────────────────────────────────────────────
  accent:            BRAND,
  tint:              BRAND,
  tabIconDefault:    "#625B50",
  tabIconSelected:   BRAND,

  // ── Icons ───────────────────────────────────────────────────────────────────
  icon:              "#3E392F",
  iconMuted:         "#625B50",

  // ── Chat bubbles ────────────────────────────────────────────────────────────
  bubble:            BRAND,
  bubbleText:        "#FFFFFF",
  bubbleIncoming:    "#E2DBCF",
  bubbleIncomingText:"#1A1208",

  // ── Form inputs ─────────────────────────────────────────────────────────────
  inputBg:           "#FFFFFF",

  // ── Glass surface tokens (light equivalents — subtle shadows) ────────────────
  glassBg:           "rgba(0,0,0,0.08)",
  glassBgSubtle:     "rgba(0,0,0,0.05)",

  // ── Navigation ──────────────────────────────────────────────────────────────
  header:            "#F0EBE1",
  navigationSurface: "#FFFEFA",
  navigationBorder:  "transparent",
  navigationActive:  BRAND,
  navigationInactive: "#625B50",

  // ── Badges ──────────────────────────────────────────────────────────────────
  badgeBg:           STATUS.error,
  badgeText:         "#FFFFFF",

  // ── Presence ────────────────────────────────────────────────────────────────
  online:            BRAND,
  unread:            BRAND,
  avatar:            "#C7BEAF",

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
  text:              "#F4F5F7",
  textSecondary:     "#D8DCE1",
  textMuted:         "#B8BDC5",

  // ── Backgrounds — layered charcoal surfaces with clear separation ───────────
  background:        "#18191C",
  backgroundSecondary: "#202226",
  backgroundTertiary:  "#292B30",
  surface:           "#25272C",
  card:              "#2C2F34",

  // ── Lines ───────────────────────────────────────────────────────────────────
  border:            "transparent",
  separator:         "transparent",

  // ── Interactive ─────────────────────────────────────────────────────────────
  accent:            BRAND,
  tint:              BRAND,
  tabIconDefault:    "#B8BDC5",
  tabIconSelected:   BRAND,

  // ── Icons ───────────────────────────────────────────────────────────────────
  icon:              "#D8DCE1",
  iconMuted:         "#B8BDC5",

  // ── Chat bubbles ────────────────────────────────────────────────────────────
  bubble:            BRAND,
  bubbleText:        "#FFFFFF",
  bubbleIncoming:    "#2B2E33",
  bubbleIncomingText:"#F4F5F7",

  // ── Form inputs — glass style matching auth screens ──────────────────────────
  inputBg:           "#2C2F34",

  // ── Glass surface tokens (match login / welcome glass aesthetic) ─────────────
  glassBg:           "rgba(255,255,255,0.12)",
  glassBgSubtle:     "rgba(255,255,255,0.08)",

  // ── Navigation ──────────────────────────────────────────────────────────────
  header:            "#202226",
  navigationSurface: "#24262B",
  navigationBorder:  "transparent",
  navigationActive:  "#FFF8F0",
  navigationInactive: "#B8BDC5",

  // ── Badges ──────────────────────────────────────────────────────────────────
  badgeBg:           STATUS.error,
  badgeText:         "#FFFFFF",

  // ── Presence ────────────────────────────────────────────────────────────────
  online:            BRAND,
  unread:            BRAND,
  avatar:            "#34373D",

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

const attachmentActions = {
  photos: "#DB2777",
  camera: "#F97316",
  audio: "#0891B2",
  document: "#16A34A",
  wallet: "#7C3AED",
} as const;

export default {
  // ── Raw brand palette ───────────────────────────────────────────────────────
  brand:      BRAND,
  brandDark:  BRAND_DARK,
  blue:       BRAND_BLUE,
  gold:       GOLD,
  attachmentActions,

  // ── Status (theme-independent) ──────────────────────────────────────────────
  status:     STATUS,

  // ── Theme palettes ──────────────────────────────────────────────────────────
  light,
  dark,
};
