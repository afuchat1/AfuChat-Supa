import { APP_GROUPED_ROUTE_PATHS, APP_ROUTE_PATHS } from "./generatedRouteManifest";
import { isFullAppId } from "./superapp/appRouteIds";

const ROUTE_PATTERNS: readonly string[] = [
  ...APP_ROUTE_PATHS,
  ...APP_GROUPED_ROUTE_PATHS,
];

function pathFromHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return null;
  const queryOrHashIndex = trimmed.search(/[?#]/);
  const pathname = queryOrHashIndex < 0 ? trimmed : trimmed.slice(0, queryOrHashIndex);
  return pathname || null;
}

function decodeSegments(pathname: string): string[] | null {
  try {
    const cleanPath = pathname.replace(/\/+$/, "") || "/";
    if (cleanPath.includes("\\") || cleanPath.includes("//")) return null;
    const segments = cleanPath.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("/"))) return null;
    return segments;
  } catch {
    return null;
  }
}

function routePatternMatches(pattern: string, pathname: string): boolean {
  const patternSegments = decodeSegments(pattern);
  const pathSegments = decodeSegments(pathname);
  if (!patternSegments || !pathSegments) return false;

  let patternIndex = 0;
  let pathIndex = 0;
  while (patternIndex < patternSegments.length) {
    const patternSegment = patternSegments[patternIndex];
    if (/^\[\[\.\.\..+\]\]$/.test(patternSegment)) return true;
    if (/^\[\.\.\..+\]$/.test(patternSegment)) {
      return pathIndex < pathSegments.length;
    }
    if (pathIndex >= pathSegments.length) return false;
    if (!/^\[[^/]+\]$/.test(patternSegment) && patternSegment !== pathSegments[pathIndex]) return false;
    patternIndex += 1;
    pathIndex += 1;
  }
  return pathIndex === pathSegments.length;
}

function matchesAnyRoutePattern(pathname: string): boolean {
  return ROUTE_PATTERNS.some((pattern) => routePatternMatches(pattern, pathname));
}

/**
 * Includes unfilled route templates; intended for route-tree diagnostics only.
 */
export function isKnownInternalRoutePattern(href: string): boolean {
  const pathname = pathFromHref(href);
  if (!pathname || !matchesAnyRoutePattern(pathname)) return false;

  const appSegments = decodeSegments(pathname);
  if (appSegments?.[0] === "app" && appSegments[1] !== "[appId]" && !isFullAppId(appSegments[1] ?? "")) {
    return false;
  }
  return true;
}

/**
 * True only for an internal Expo Router route generated from app/.
 * Dynamic app routes also require a real app id, preventing invented mini-apps.
 */
export function isValidInternalRoute(href: string): boolean {
  if (typeof href !== "string") return false;
  const pathname = pathFromHref(href);
  if (!pathname || !isKnownInternalRoutePattern(href)) return false;
  const appSegments = decodeSegments(pathname);
  if (appSegments?.some((segment) => /^\[[^/]+\]$/.test(segment))) return false;

  // The single-segment profile fallback can match any word, but AfuAI should
  // only use it for explicit @handle links, never as a substitute for a
  // missing feature page such as /monetize or /shop.
  const hasStaticRouteMatch = [...APP_ROUTE_PATHS, ...APP_GROUPED_ROUTE_PATHS]
    .some((pattern) => !pattern.includes("[") && routePatternMatches(pattern, pathname));
  if (appSegments?.length === 1 && !hasStaticRouteMatch && !appSegments[0].startsWith("@")) return false;

  return true;
}

export function getAppRouteIndex(): readonly string[] {
  return APP_ROUTE_PATHS;
}
