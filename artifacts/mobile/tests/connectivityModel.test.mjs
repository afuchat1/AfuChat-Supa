import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveConnectivityPhase,
  resolveOfflineBannerState,
} from "../lib/connectivityModel.ts";

test("no network transport means waiting for network", () => {
  assert.equal(resolveConnectivityPhase({
    transportConnected: false,
    internetReachable: false,
    backendReachable: null,
    browserOnline: null,
  }), "offline");
});

test("active transport without confirmed internet means connecting", () => {
  assert.equal(resolveConnectivityPhase({
    transportConnected: true,
    internetReachable: false,
    backendReachable: null,
    browserOnline: null,
  }), "connecting");
  assert.equal(resolveConnectivityPhase({
    transportConnected: true,
    internetReachable: null,
    backendReachable: null,
    browserOnline: null,
  }), "connecting");
});

test("a real backend response overrides a stale Android reachability probe", () => {
  assert.equal(resolveConnectivityPhase({
    transportConnected: false,
    internetReachable: false,
    backendReachable: true,
    browserOnline: null,
  }), "online");
});

test("failed backend requests keep an otherwise connected device in connecting state", () => {
  assert.equal(resolveConnectivityPhase({
    transportConnected: true,
    internetReachable: true,
    backendReachable: false,
    browserOnline: null,
  }), "connecting");
});

test("updating is visible only during a real sync on a live connection", () => {
  assert.equal(resolveOfflineBannerState("online", true), "updating");
  assert.equal(resolveOfflineBannerState("online", false), "hidden");
  assert.equal(resolveOfflineBannerState("connecting", true), "connecting");
  assert.equal(resolveOfflineBannerState("offline", true), "offline");
});
