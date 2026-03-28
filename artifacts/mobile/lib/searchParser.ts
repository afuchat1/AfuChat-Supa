export type MediaFilter = "images" | "videos" | null;
export type TimeFilter = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | null;

export interface ParsedQuery {
  cleanQuery: string;
  person: string | null;
  hashtag: string | null;
  timeFilter: TimeFilter;
  mediaFilter: MediaFilter;
  command: string | null;
  isHashtagSearch: boolean;
  isPersonSearch: boolean;
  isCommandSearch: boolean;
}

const TIME_PATTERNS: { pattern: RegExp; filter: TimeFilter }[] = [
  { pattern: /\b(?:today|today's)\b/i, filter: "today" },
  { pattern: /\byesterday(?:'s)?\b/i, filter: "yesterday" },
  { pattern: /\bthis\s+week(?:'s)?\b/i, filter: "this_week" },
  { pattern: /\blast\s+week(?:'s)?\b/i, filter: "last_week" },
  { pattern: /\bthis\s+month(?:'s)?\b/i, filter: "this_month" },
  { pattern: /\blast\s+month(?:'s)?\b/i, filter: "last_month" },
  { pattern: /\brecent(?:ly)?\b/i, filter: "this_week" },
];

const MEDIA_PATTERNS: { pattern: RegExp; filter: MediaFilter }[] = [
  { pattern: /\b(?:photos?|images?|pictures?|pics?)\b/i, filter: "images" },
  { pattern: /\b(?:videos?|clips?)\b/i, filter: "videos" },
];

const PERSON_PATTERNS = [
  /\bfrom\s+@?(\w+)\b/i,
  /\bby\s+@?(\w+)\b/i,
  /\bsent\s+by\s+@?(\w+)\b/i,
  /\b@(\w+)\b/,
];

const NOISE_WORDS = /\b(?:sent|shared|posted|from|by|in|the|a|an|about|with|that|this|last|my|me|i)\b/gi;

const COMMANDS: Record<string, { category?: string; mediaFilter?: MediaFilter }> = {
  "/images": { mediaFilter: "images" },
  "/photos": { mediaFilter: "images" },
  "/videos": { mediaFilter: "videos" },
  "/people": { category: "people" },
  "/users": { category: "people" },
  "/posts": { category: "posts" },
  "/channels": { category: "channels" },
  "/gifts": { category: "gifts" },
};

export function parseSearchQuery(raw: string): ParsedQuery {
  let text = raw.trim();
  let person: string | null = null;
  let hashtag: string | null = null;
  let timeFilter: TimeFilter = null;
  let mediaFilter: MediaFilter = null;
  let command: string | null = null;
  let isHashtagSearch = false;
  let isPersonSearch = false;
  let isCommandSearch = false;

  if (text.startsWith("/")) {
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    if (COMMANDS[cmd]) {
      command = cmd;
      isCommandSearch = true;
      if (COMMANDS[cmd].mediaFilter) mediaFilter = COMMANDS[cmd].mediaFilter!;
      text = parts.slice(1).join(" ");
    }
  }

  if (text.startsWith("#") && !text.includes(" ")) {
    hashtag = text.slice(1);
    isHashtagSearch = true;
    return { cleanQuery: hashtag, person, hashtag, timeFilter, mediaFilter, command, isHashtagSearch, isPersonSearch, isCommandSearch };
  }

  const hashtagMatch = text.match(/#(\w+)/);
  if (hashtagMatch) {
    hashtag = hashtagMatch[1];
    isHashtagSearch = true;
    text = text.replace(/#\w+/, "").trim();
  }

  for (const p of PERSON_PATTERNS) {
    const match = text.match(p);
    if (match) {
      person = match[1];
      isPersonSearch = true;
      text = text.replace(p, "").trim();
      break;
    }
  }

  for (const { pattern, filter } of TIME_PATTERNS) {
    if (pattern.test(text)) {
      timeFilter = filter;
      text = text.replace(pattern, "").trim();
      break;
    }
  }

  for (const { pattern, filter } of MEDIA_PATTERNS) {
    if (pattern.test(text)) {
      mediaFilter = filter;
      text = text.replace(pattern, "").trim();
      break;
    }
  }

  const cleanQuery = text.replace(NOISE_WORDS, "").replace(/\s{2,}/g, " ").trim();

  return { cleanQuery, person, hashtag, timeFilter, mediaFilter, command, isHashtagSearch, isPersonSearch, isCommandSearch };
}

export function getTimeRange(filter: TimeFilter): { from: string; to: string } | null {
  if (!filter) return null;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case "today":
      return { from: startOfDay.toISOString(), to: now.toISOString() };
    case "yesterday": {
      const yStart = new Date(startOfDay);
      yStart.setDate(yStart.getDate() - 1);
      return { from: yStart.toISOString(), to: startOfDay.toISOString() };
    }
    case "this_week": {
      const wStart = new Date(startOfDay);
      wStart.setDate(wStart.getDate() - wStart.getDay());
      return { from: wStart.toISOString(), to: now.toISOString() };
    }
    case "last_week": {
      const lwEnd = new Date(startOfDay);
      lwEnd.setDate(lwEnd.getDate() - lwEnd.getDay());
      const lwStart = new Date(lwEnd);
      lwStart.setDate(lwStart.getDate() - 7);
      return { from: lwStart.toISOString(), to: lwEnd.toISOString() };
    }
    case "this_month": {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: mStart.toISOString(), to: now.toISOString() };
    }
    case "last_month": {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: lmStart.toISOString(), to: lmEnd.toISOString() };
    }
    default:
      return null;
  }
}

export function getTimeFilterLabel(filter: TimeFilter): string {
  switch (filter) {
    case "today": return "Today";
    case "yesterday": return "Yesterday";
    case "this_week": return "This Week";
    case "last_week": return "Last Week";
    case "this_month": return "This Month";
    case "last_month": return "Last Month";
    default: return "";
  }
}

export function getMediaFilterLabel(filter: MediaFilter): string {
  switch (filter) {
    case "images": return "Images";
    case "videos": return "Videos";
    default: return "";
  }
}
