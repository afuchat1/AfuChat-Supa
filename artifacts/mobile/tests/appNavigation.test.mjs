import test from "node:test";
import assert from "node:assert/strict";
import {
  appRouteHrefMatchesLocation,
  normalizeAppNavKey,
  resolveAppRouteAction,
} from "../lib/superapp/appNavigation.ts";

test("app tab changes update the current route and clear stale detail params", () => {
  const action = resolveAppRouteAction(
    "/app/afumarket",
    "/app/afumarket?section=cart",
    {
      appId: "afumarket",
      section: "product",
      id: "product-1",
      userId: "seller-1",
    },
  );

  assert.deepEqual(action, {
    kind: "params",
    params: {
      section: "cart",
      id: undefined,
      userId: undefined,
    },
  });
});

test("a destination outside the current app keeps normal route navigation", () => {
  assert.deepEqual(
    resolveAppRouteAction("/app/afufootball", "/football/match/123", { appId: "afufootball" }),
    { kind: "navigate", href: "/football/match/123" },
  );
});

test("app nav selection matches the section query, not just the pathname", () => {
  assert.equal(
    appRouteHrefMatchesLocation(
      "/app/afufootball?section=search",
      "/app/afufootball",
      { appId: "afufootball", section: "search" },
    ),
    true,
  );
  assert.equal(
    appRouteHrefMatchesLocation(
      "/app/afufootball",
      "/app/afufootball",
      { appId: "afufootball", section: "search" },
    ),
    false,
  );
});

test("nested app sections select their matching parent tab", () => {
  assert.equal(normalizeAppNavKey("afumarket", "manage"), "sell");
  assert.equal(normalizeAppNavKey("afumarket", "order"), "orders");
  assert.equal(normalizeAppNavKey("afubusiness", "edit-product"), "products");
  assert.equal(normalizeAppNavKey("afufreelance", "detail"), "browse");
  assert.equal(normalizeAppNavKey("afumatch", "settings"), "preferences");
  assert.equal(normalizeAppNavKey("afufootball", "search"), "search");
  assert.equal(normalizeAppNavKey("afumusic", "offline", "web"), "discover");
});
