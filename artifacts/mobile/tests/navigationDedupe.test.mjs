import test from "node:test";
import assert from "node:assert/strict";
import {
  incomingLinkEventKey,
  NavigationRouteGate,
  RecentEventGate,
  routeIdentityFromHref,
  routeIdentityFromLocation,
  routeScreenIdentityFromHref,
  routeScreenIdentityFromLocation,
} from "../lib/navigationDedupe.ts";

test("route identity removes Expo route groups and resolves dynamic params", () => {
  assert.equal(
    routeIdentityFromHref({ pathname: "/(tabs)/chats" }),
    routeIdentityFromLocation("/chats"),
  );
  assert.equal(
    routeIdentityFromHref({
      pathname: "/chat/[id]",
      params: { id: "conversation-123", messageId: "message-456" },
    }),
    routeIdentityFromLocation("/chat/conversation-123", {
      id: "conversation-123",
      messageId: "message-456",
    }),
  );
});

test("different entities and query destinations remain distinct", () => {
  const first = routeIdentityFromHref({
    pathname: "/contact/[id]",
    params: { id: "person-one" },
  });
  const second = routeIdentityFromHref({
    pathname: "/contact/[id]",
    params: { id: "person-two" },
  });
  const searchA = routeIdentityFromHref({ pathname: "/app/afusearch", params: { q: "cats" } });
  const searchB = routeIdentityFromHref({ pathname: "/app/afusearch", params: { q: "dogs" } });

  assert.notEqual(first, second);
  assert.notEqual(searchA, searchB);
});

test("equivalent Android and web app links share one event key", () => {
  const key = incomingLinkEventKey("afuchat://chat/conversation-123?source=push");
  assert.equal(
    key,
    incomingLinkEventKey("afuchat:///chat/conversation-123?source=push"),
  );
  assert.equal(
    key,
    incomingLinkEventKey("https://afuchat.com/chat/conversation-123?source=push"),
  );
});

test("recent event gate rejects repeats but allows later intentional opens", () => {
  const gate = new RecentEventGate(5_000, 4);

  assert.equal(gate.claim("notification-1", 1_000), true);
  assert.equal(gate.claim("notification-1", 4_000), false);
  assert.equal(gate.claim("notification-1", 7_000), true);
});

test("route gate skips an active page and reuses a visited stack destination", () => {
  const gate = new NavigationRouteGate(5_000, 10);
  const chat = routeIdentityFromHref({
    pathname: "/chat/[id]",
    params: { id: "conversation-123" },
  });
  const chatScreen = routeScreenIdentityFromHref({
    pathname: "/chat/[id]",
    params: { id: "conversation-123" },
  });
  const discover = routeIdentityFromLocation("/discover");
  const discoverScreen = routeScreenIdentityFromLocation("/discover");

  assert.deepEqual(gate.decide("push", chat, chatScreen, 1_000), {
    skip: false,
    reuseVisitedRoute: false,
  });
  assert.deepEqual(gate.decide("push", chat, chatScreen, 2_000), {
    skip: true,
    reuseVisitedRoute: false,
  });
  gate.updateCurrentRoute(chat, chatScreen);
  assert.deepEqual(gate.decide("push", chat, chatScreen, 20_000), {
    skip: true,
    reuseVisitedRoute: false,
  });
  gate.updateCurrentRoute(discover, discoverScreen);
  assert.deepEqual(gate.decide("push", chat, chatScreen, 21_000), {
    skip: false,
    reuseVisitedRoute: true,
  });
});

test("query changes reuse the current screen instead of stacking a copy", () => {
  const gate = new NavigationRouteGate();
  const current = routeIdentityFromHref({
    pathname: "/app/afusearch",
    params: { q: "cats" },
  });
  const target = routeIdentityFromHref({
    pathname: "/app/afusearch",
    params: { q: "dogs" },
  });
  const screen = routeScreenIdentityFromHref("/app/afusearch");

  gate.updateCurrentRoute(current, screen);
  assert.deepEqual(gate.decide("push", target, screen), {
    skip: false,
    reuseVisitedRoute: true,
  });
});
