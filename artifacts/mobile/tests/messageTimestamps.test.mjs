import test from "node:test";
import assert from "node:assert/strict";
import {
  compareMessageTimestamps,
  latestMessageTimestamp,
  normalizeMessageTimestamp,
  resolveMessageTimestamp,
} from "../lib/messageTimestamps.ts";

test("normalizes valid message timestamps and rejects missing or malformed values", () => {
  assert.equal(
    normalizeMessageTimestamp("2026-11-13T12:30:00+03:00"),
    "2026-11-13T09:30:00.000Z",
  );
  assert.equal(normalizeMessageTimestamp(""), null);
  assert.equal(normalizeMessageTimestamp("not-a-date"), null);
});

test("prefers the database sent_at field and reads legacy queued created_at", () => {
  assert.equal(
    resolveMessageTimestamp({
      sent_at: "2026-11-13T09:30:00Z",
      created_at: "2026-11-13T09:00:00Z",
    }),
    "2026-11-13T09:30:00.000Z",
  );
  assert.equal(
    resolveMessageTimestamp({ created_at: "2026-11-13T09:00:00Z" }),
    "2026-11-13T09:00:00.000Z",
  );
  assert.equal(resolveMessageTimestamp({ created_at: "invalid" }), "");
});

test("receipt ordering compares instants instead of timestamp text", () => {
  const earlierOffsetTime = "2026-11-13T12:00:00+04:00";
  const laterUtcTime = "2026-11-13T09:00:00Z";

  assert.equal(
    latestMessageTimestamp(earlierOffsetTime, laterUtcTime),
    "2026-11-13T09:00:00.000Z",
  );
  assert.ok(compareMessageTimestamps(earlierOffsetTime, laterUtcTime) < 0);
  assert.ok(compareMessageTimestamps(laterUtcTime, earlierOffsetTime, "desc") < 0);
  assert.ok(compareMessageTimestamps("invalid", laterUtcTime) > 0);
});
