export type WindowWidthClass = "compact" | "medium" | "expanded";

/**
 * Width classes follow Android's adaptive layout guidance and use the app
 * window's current width, not a device model or physical screen size.
 */
export function classifyWindowWidth(width: number): WindowWidthClass {
  if (width < 600) return "compact";
  if (width < 840) return "medium";
  return "expanded";
}
