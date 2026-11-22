import type { FullAppId } from "./appRouteIds";

export type AppRouteParams = Record<string, unknown>;

export type AppRouteAction =
  | { kind: "params"; params: Record<string, string | undefined> }
  | { kind: "navigate"; href: string };

function routeParts(href: string) {
  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex < 0 ? withoutHash : withoutHash.slice(0, queryIndex);
  const params: Record<string, string> = {};
  if (queryIndex >= 0) {
    new URLSearchParams(withoutHash.slice(queryIndex + 1)).forEach((value, key) => {
      params[key] = value;
    });
  }
  return { pathname, params };
}

function normalizedPathname(pathname: string) {
  const clean = pathname.replace(/\/+$/, "");
  return clean || "/";
}

function firstParamValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

/**
 * App tab changes should update the existing /app/[appId] route instead of
 * replacing it with another full-screen route. Clear stale detail params so
 * the selected app section is the only route state that controls the screen.
 */
export function resolveAppRouteAction(
  currentPathname: string,
  href: string,
  currentParams: AppRouteParams = {},
): AppRouteAction {
  const target = routeParts(href);
  if (
    !href.startsWith("/") ||
    normalizedPathname(target.pathname) !== normalizedPathname(currentPathname)
  ) {
    return { kind: "navigate", href };
  }

  const keys = new Set([...Object.keys(currentParams), ...Object.keys(target.params)]);
  const params: Record<string, string | undefined> = {};
  for (const key of keys) {
    if (key === "appId") continue;
    params[key] = target.params[key];
  }
  return { kind: "params", params };
}

export function appRouteHrefMatchesLocation(
  href: string,
  pathname: string,
  currentParams: AppRouteParams = {},
): boolean {
  const target = routeParts(href);
  if (normalizedPathname(target.pathname) !== normalizedPathname(pathname)) return false;

  const section = firstParamValue(currentParams.section);
  if ((target.params.section ?? undefined) !== section) return false;
  return Object.entries(target.params).every(
    ([key, value]) => firstParamValue(currentParams[key]) === value,
  );
}

const DEFAULT_NAV_KEY: Partial<Record<FullAppId, string>> = {
  afumarket: "browse",
  afubusiness: "home",
  afufreelance: "browse",
  afufiles: "library",
  afugifts: "gifts",
  afuevents: "upcoming",
  afumatch: "discover",
  afucollections: "collections",
  afuusernames: "market",
  afuqr: "scan",
  afusaved: "saved",
  afumusic: "discover",
  afufootball: "live",
};

export function normalizeAppNavKey(
  appId: FullAppId,
  section?: string,
  platform: "web" | "native" = "native",
): string | undefined {
  if (appId === "afusearch" || appId === "afupay") return undefined;

  const defaultKey = DEFAULT_NAV_KEY[appId];
  if (!section) return defaultKey;

  switch (appId) {
    case "afumarket":
      if (section === "cart" || section === "orders") return section;
      if (["apply", "apply-seller", "manage"].includes(section)) return "sell";
      if (section === "order") return "orders";
      return "browse";
    case "afubusiness":
      if (["analytics"].includes(section)) return "analytics";
      if (["products", "add-product", "edit-product"].includes(section)) return "products";
      if (["orders", "order-detail"].includes(section)) return "orders";
      return "home";
    case "afufreelance":
      return section === "post-gig" ? "post-gig" : "browse";
    case "afugifts":
      return section === "marketplace" ? "marketplace" : "gifts";
    case "afuevents":
      return ["online", "free"].includes(section) ? section : "upcoming";
    case "afumatch":
      if (section === "matches") return "matches";
      if (["preferences", "settings"].includes(section)) return "preferences";
      return "discover";
    case "afuusernames":
      return ["owned", "mine"].includes(section) ? section : "market";
    case "afumusic":
      return platform === "web" && section === "offline" ? "discover" :
        ["library", "offline", "studio"].includes(section) ? section : "discover";
    case "afufootball":
      if (section === "search") return "search";
      if (["competitions", "standings"].includes(section)) return "competitions";
      if (["followed", "teams"].includes(section)) return "followed";
      return "live";
    default:
      return defaultKey;
  }
}
