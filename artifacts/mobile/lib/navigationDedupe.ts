type ParamRecord = Record<string, unknown>;
type HrefLike = string | URL | { pathname?: string; params?: ParamRecord };

function valuesForParam(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map(String);
  }
  return value === null || value === undefined ? [] : [String(value)];
}

function normalizePath(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const segments = pathOnly
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\([^/]+\)$/.test(segment));
  return `/${segments.join("/")}` || "/";
}

function serializeQuery(pairs: Array<[string, string]>): string {
  if (pairs.length === 0) return "";
  pairs.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
  );
  return `?${pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")}`;
}

function currentLocationQuery(pathname: string, params: ParamRecord): Array<[string, string]> {
  const pathSegments = new Set(
    normalizePath(pathname)
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        try { return decodeURIComponent(segment); } catch { return segment; }
      }),
  );
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(params)) {
    const values = valuesForParam(value);
    // Expo Router includes dynamic path parameters in global search params.
    // They are already represented in the concrete pathname.
    if (values.length > 0 && values.every((item) => pathSegments.has(item))) continue;
    for (const item of values) pairs.push([key, item]);
  }
  return pairs;
}

function identity(pathname: string, queryPairs: Array<[string, string]>): string {
  return `${normalizePath(pathname)}${serializeQuery(queryPairs)}`;
}

/** Stable identity for equivalent Expo Router hrefs and concrete locations. */
export function routeIdentityFromHref(href: unknown): string | null {
  try {
    if (typeof href === "string" || href instanceof URL) {
      const parsed = new URL(String(href), "https://afuchat.invalid");
      return identity(parsed.pathname, Array.from(parsed.searchParams.entries()));
    }

    if (!href || typeof href !== "object") return null;
    const value = href as { pathname?: unknown; params?: ParamRecord };
    if (typeof value.pathname !== "string") return null;
    const params = value.params ?? {};
    const consumedParams = new Set<string>();
    const dynamicPattern = /\[\[\.\.\.([^\]]+)\]\]|\[\.\.\.([^\]]+)\]|\[\[([^\]]+)\]\]|\[([^\]]+)\]/g;
    const pathname = value.pathname.replace(
      dynamicPattern,
      (match, optionalCatchAll: string, catchAll: string, optional: string, regular: string) => {
        const key = optionalCatchAll ?? catchAll ?? optional ?? regular;
        consumedParams.add(key);
        const values = valuesForParam(params[key]);
        if (values.length === 0) return "";
        if (optionalCatchAll || catchAll) {
          return values.map((item) => encodeURIComponent(item)).join("/");
        }
        return encodeURIComponent(values[0]);
      },
    );
    const queryPairs: Array<[string, string]> = [];
    for (const [key, param] of Object.entries(params)) {
      if (consumedParams.has(key)) continue;
      for (const item of valuesForParam(param)) queryPairs.push([key, item]);
    }
    return identity(pathname, queryPairs);
  } catch {
    return null;
  }
}

/** Stable identity for the currently focused route and its query parameters. */
export function routeIdentityFromLocation(
  pathname: string,
  params: ParamRecord = {},
): string | null {
  if (!pathname) return null;
  return identity(pathname, currentLocationQuery(pathname, params));
}

/** Screen identity deliberately ignores query params to prevent stack copies. */
export function routeScreenIdentityFromHref(href: unknown): string | null {
  return routeIdentityFromHref(href)?.split("?", 1)[0] ?? null;
}

export function routeScreenIdentityFromLocation(pathname: string): string | null {
  return pathname ? normalizePath(pathname) : null;
}

/** Normalize duplicate native URL events, including Android scheme variants. */
export function incomingLinkEventKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const isCustomScheme = parsed.protocol.toLowerCase() === "afuchat:";
    const isAfuWebLink =
      parsed.hostname.toLowerCase() === "afuchat.com" ||
      parsed.hostname.toLowerCase() === "www.afuchat.com";
    let pathname = parsed.pathname;
    if (isCustomScheme) {
      pathname = `/${[parsed.hostname, ...parsed.pathname.split("/")].filter(Boolean).join("/")}`;
    } else if (!isAfuWebLink) {
      pathname = `//${parsed.hostname.toLowerCase()}${parsed.pathname}`;
    }
    return identity(pathname, Array.from(parsed.searchParams.entries()));
  } catch {
    return url.trim() || null;
  }
}

/** A small bounded gate for duplicate OS events delivered close together. */
export class RecentEventGate {
  private readonly seenAt = new Map<string, number>();
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(windowMs: number, maxEntries = 128) {
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
  }

  claim(key: string | null | undefined, now = Date.now()): boolean {
    if (!key) return false;
    const previous = this.seenAt.get(key);
    if (previous !== undefined && now - previous < this.windowMs) return false;

    this.seenAt.set(key, now);
    for (const [seenKey, seenTime] of this.seenAt) {
      if (now - seenTime >= this.windowMs) this.seenAt.delete(seenKey);
    }
    while (this.seenAt.size > this.maxEntries) {
      const oldestKey = this.seenAt.keys().next().value;
      if (oldestKey === undefined) break;
      this.seenAt.delete(oldestKey);
    }
    return true;
  }
}

export type NavigationRouteDecision = {
  skip: boolean;
  reuseVisitedRoute: boolean;
};

/** Decides whether an imperative navigation would duplicate a route. */
export class NavigationRouteGate {
  private currentRouteIdentity: string | null = null;
  private currentScreenIdentity: string | null = null;
  private readonly visitedScreens = new Set<string>();
  private readonly recentActions = new Map<string, number>();
  private readonly duplicateWindowMs: number;
  private readonly maxVisitedRoutes: number;

  constructor(duplicateWindowMs = 5_000, maxVisitedRoutes = 200) {
    this.duplicateWindowMs = duplicateWindowMs;
    this.maxVisitedRoutes = maxVisitedRoutes;
  }

  updateCurrentRoute(identity: string | null, screenIdentity: string | null): void {
    if (screenIdentity !== this.currentScreenIdentity) {
      // A genuine route change ends the pending duplicate window so a user
      // can intentionally reopen that destination after leaving it.
      this.recentActions.clear();
    }
    this.currentRouteIdentity = identity;
    this.currentScreenIdentity = screenIdentity;
    if (!screenIdentity) return;
    this.visitedScreens.add(screenIdentity);
    while (this.visitedScreens.size > this.maxVisitedRoutes) {
      const oldestIdentity = this.visitedScreens.values().next().value;
      if (oldestIdentity === undefined) break;
      this.visitedScreens.delete(oldestIdentity);
    }
  }

  decide(
    kind: "push" | "replace" | "navigate",
    identity: string | null,
    screenIdentity: string | null,
    now = Date.now(),
  ): NavigationRouteDecision {
    if (!identity || !screenIdentity) return { skip: false, reuseVisitedRoute: false };
    if (identity === this.currentRouteIdentity) {
      return { skip: true, reuseVisitedRoute: false };
    }

    for (const [routeIdentity, startedAt] of this.recentActions) {
      if (now - startedAt >= this.duplicateWindowMs) {
        this.recentActions.delete(routeIdentity);
      }
    }
    const previousActionAt = this.recentActions.get(identity);
    if (
      previousActionAt !== undefined &&
      now - previousActionAt < this.duplicateWindowMs
    ) {
      return { skip: true, reuseVisitedRoute: false };
    }
    this.recentActions.set(identity, now);
    return {
      skip: false,
      reuseVisitedRoute: kind === "push" && this.visitedScreens.has(screenIdentity),
    };
  }
}
