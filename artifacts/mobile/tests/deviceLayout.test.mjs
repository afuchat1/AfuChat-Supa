import test from "node:test";
import assert from "node:assert/strict";
import { classifyWindowWidth } from "../lib/deviceLayout.ts";

test("window width classes adapt at standard responsive breakpoints", () => {
  assert.equal(classifyWindowWidth(359), "compact");
  assert.equal(classifyWindowWidth(599), "compact");
  assert.equal(classifyWindowWidth(600), "medium");
  assert.equal(classifyWindowWidth(839), "medium");
  assert.equal(classifyWindowWidth(840), "expanded");
  assert.equal(classifyWindowWidth(1280), "expanded");
});
