import test from "node:test";
import assert from "node:assert/strict";
import {
  chatActivityLabel,
  normalizeChatActivity,
} from "../lib/chatActivity.ts";

test("normalizes current and legacy typing broadcasts", () => {
  assert.equal(normalizeChatActivity({ activity: "typing" }), "typing");
  assert.equal(normalizeChatActivity({ is_typing: true }), "typing");
  assert.equal(normalizeChatActivity({ is_typing: false }), null);
});

test("normalizes recording and image-send broadcasts", () => {
  assert.equal(normalizeChatActivity({ activity: "recording" }), "recording");
  assert.equal(normalizeChatActivity({ activity: "sending_image" }), "sending_image");
  assert.equal(normalizeChatActivity({ activity: "unknown" }), null);
  assert.equal(chatActivityLabel("recording"), "recording audio");
  assert.equal(chatActivityLabel("sending_image"), "sending image");
});
