export const APP_ROUTE_IDS = [
  "afupay",
  "afumarket",
  "afugames",
  "afubusiness",
  "afusearch",
  "afufreelance",
  "afufiles",
  "afugifts",
  "afuevents",
  "afumatch",
  "afucollections",
  "afuusernames",
  "afuqr",
  "afusaved",
  "afumusic",
] as const;

export type FullAppId = (typeof APP_ROUTE_IDS)[number];

const appRouteIdSet: ReadonlySet<string> = new Set(APP_ROUTE_IDS);

export function isFullAppId(value: string): value is FullAppId {
  return appRouteIdSet.has(value);
}
