// ─── AfuChat Brand Identity ───────────────────────────────────────────────────
// ONE source of truth for all color decisions.
// Import `Colors` (default) for raw palette values.
// Import `useTheme()` for the live, resolved theme object inside components.

// Sampled from the dominant blue in the supplied AfuChat app icon.
const BRAND        = "#1F95FF";   // primary brand — all interactive elements
const BRAND_DARK   = "#1475D1";   // pressed / darker variant of brand
const BRAND_BLUE   = "#1F95FF";   // compatibility alias for the icon blue
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
  text:              "#152638",
  textSecondary:     "#52677B",
  textMuted:         "#8193A5",

  // ── Nature-inspired cool neutrals ──────────────────────────────────────────
  background:        "#F3F7FB",   // page / screen
  backgroundSecondary: "#EAF1F7", // inset areas and quiet controls
  backgroundTertiary:  "#DFEAF3", // selected and nested surfaces
  surface:           "#FFFFFF",   // cards, sheets, floating controls
  card:              "#FFFFFF",

  // ── Lines ───────────────────────────────────────────────────────────────────
  border:            "#D8E3ED",
  separator:         "#E7EEF4",

  // ── Interactive ─────────────────────────────────────────────────────────────
  accent:            BRAND,
  tint:              BRAND,
  tabIconDefault:    "#8193A5",
  tabIconSelected:   BRAND,

  // ── Icons ───────────────────────────────────────────────────────────────────
  icon:              "#52677B",
  iconMuted:         "#8193A5",

  // ── Chat bubbles ────────────────────────────────────────────────────────────
  bubble:            BRAND,
  bubbleText:        "#FFFFFF",
  bubbleIncoming:    "#E7EFF6",
  bubbleIncomingText:"#152638",

  // ── Form inputs ─────────────────────────────────────────────────────────────
  inputBg:           "#EDF3F8",

  // ── Glass surface tokens (light equivalents — subtle shadows) ────────────────
  glassBg:           "rgba(255,255,255,0.78)",
  glassBgSubtle:     "rgba(255,255,255,0.58)",

  // ── Navigation ──────────────────────────────────────────────────────────────
  header:            "#F3F7FB",

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
  text:              "#F3F8FC",
  textSecondary:     "#A9BBCB",
  textMuted:         "#7E91A3",

  // ── Backgrounds — flat UI: one universal BG, no card elevation ──────────────
  background:        "#080E14",
  backgroundSecondary: "#101A25",
  backgroundTertiary:  "#172532",
  surface:           "#111D29",
  card:              "#162431",

  // ── Lines ───────────────────────────────────────────────────────────────────
  border:            "rgba(210,228,242,0.12)",
  separator:         "rgba(210,228,242,0.08)",

  // ── Interactive ─────────────────────────────────────────────────────────────
  accent:            BRAND,
  tint:              BRAND,
  tabIconDefault:    "#8294A5",
  tabIconSelected:   BRAND,

  // ── Icons ───────────────────────────────────────────────────────────────────
  icon:              "#B1C0CE",
  iconMuted:         "#8294A5",

  // ── Chat bubbles ────────────────────────────────────────────────────────────
  bubble:            BRAND,
  bubbleText:        "#FFFFFF",
  bubbleIncoming:    "#1A2A38",
  bubbleIncomingText:"#EAF2F8",

  // ── Form inputs — glass style matching auth screens ──────────────────────────
  inputBg:           "rgba(255,255,255,0.07)",

  // ── Glass surface tokens (match login / welcome glass aesthetic) ─────────────
  glassBg:           "rgba(17,29,41,0.80)",
  glassBgSubtle:     "rgba(17,29,41,0.58)",

  // ── Navigation ──────────────────────────────────────────────────────────────
  header:            "#080E14",

  // ── Badges ──────────────────────────────────────────────────────────────────
  badgeBg:           STATUS.error,
  badgeText:         "#FFFFFF",

  // ── Presence ────────────────────────────────────────────────────────────────
  online:            BRAND,
  unread:            BRAND,
  avatar:            "#172532",

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
