const MINUTE = 60_000;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;
const WEEK   = 7  * DAY;
const MONTH  = 30 * DAY;
const YEAR   = 365 * DAY;

/**
 * Returns a human-friendly relative timestamp string, e.g.
 *   "just now", "5m ago", "3h ago", "2d ago", "1w ago", "3mo ago", "2y ago"
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < MINUTE)        return "just now";
  if (diff < HOUR)          return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY)           return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK)          return `${Math.floor(diff / DAY)}d ago`;
  if (diff < MONTH)         return `${Math.floor(diff / WEEK)}w ago`;
  if (diff < YEAR)          return `${Math.floor(diff / MONTH)}mo ago`;
  return `${Math.floor(diff / YEAR)}y ago`;
}
