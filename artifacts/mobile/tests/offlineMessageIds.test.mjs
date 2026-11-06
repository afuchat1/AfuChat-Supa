import test from "node:test";
import assert from "node:assert/strict";
import { createLocalMessageId, isClientMessageId } from "../lib/storage/messageIds.ts";

test("new offline message IDs are unique UUIDs accepted by the stable-ID sync path", () => {
  const ids = Array.from({ length: 1000 }, () => createLocalMessageId());
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(isClientMessageId));
});

test("legacy local message IDs are not mistaken for stable client UUIDs", () => {
  assert.equal(isClientMessageId("msg_1785010071908"), false);
  assert.equal(isClientMessageId("transfer_request_123"), false);
});
