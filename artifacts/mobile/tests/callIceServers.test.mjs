import test from "node:test";
import assert from "node:assert/strict";
import { getCallIceServers } from "../lib/callIceServers.ts";

test("voice calls use public STUN only, without paid TURN credentials", () => {
  const servers = getCallIceServers();
  const urls = servers.flatMap((server) =>
    Array.isArray(server.urls) ? server.urls : [server.urls],
  );

  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => url.startsWith("stun:")));
  assert.ok(servers.every((server) => !server.username && !server.credential));
});

test("call ICE configuration is returned as a fresh copy", () => {
  const first = getCallIceServers();
  first[0].urls = "turn:mutated.example";

  assert.equal(getCallIceServers()[0].urls, "stun:stun.l.google.com:19302");
});
