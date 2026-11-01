import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeInterestList,
  nextProfilePageOffset,
  rankPeopleByAffinity,
} from "../lib/peopleRecommendations.ts";

test("normalizes and deduplicates shared interests", () => {
  assert.deepEqual(
    normalizeInterestList([" Music ", "music", "Travel", null, 4]),
    ["music", "travel"],
  );
});

test("ranks shared interests and mutual connections", () => {
  const ranked = rankPeopleByAffinity([
    { id: "one", value: "one", interests: ["music", "travel"], mutualCount: 1 },
    { id: "two", value: "two", interests: ["music"], mutualCount: 0 },
    { id: "three", value: "three", interests: [], mutualCount: 4 },
  ], ["music", "travel"], new Set(), () => 0);

  assert.deepEqual(ranked.map(({ id }) => id), ["one", "two", "three"]);
  assert.equal(ranked[0].sharedInterestCount, 2);
});

test("uses unseen people before previously shown people", () => {
  const ranked = rankPeopleByAffinity([
    { id: "seen", value: "seen", interests: ["music", "travel"], mutualCount: 20 },
    { id: "fresh", value: "fresh", interests: ["music"], mutualCount: 0 },
  ], ["music", "travel"], new Set(["seen"]), () => 0);

  assert.deepEqual(ranked.map(({ id }) => id), ["fresh", "seen"]);
});

test("rotates discovery pages and wraps after the last partial page", () => {
  assert.equal(nextProfilePageOffset(0, 120, 120), 120);
  assert.equal(nextProfilePageOffset(120, 35, 120), 0);
  assert.equal(nextProfilePageOffset(120, 0, 120, true), 120);
});
