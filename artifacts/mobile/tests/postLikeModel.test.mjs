import test from "node:test";
import assert from "node:assert/strict";
import { resolvePostLikePresentation } from "../lib/storage/postLikeModel.ts";

test("a pending like remains visible over a stale server response and adjusts its count", () => {
  assert.deepEqual(
    resolvePostLikePresentation(false, 12, {
      liked: true,
      likeCount: 13,
      pending: true,
      updatedAt: 200,
    }, true, 100),
    { liked: true, likeCount: 13 },
  );
});

test("a pending unlike remains visible over a stale server response and adjusts its count", () => {
  assert.deepEqual(
    resolvePostLikePresentation(true, 12, {
      liked: false,
      likeCount: 11,
      pending: true,
      updatedAt: 200,
    }, true, 100),
    { liked: false, likeCount: 11 },
  );
});

test("a confirmed local state survives an offline refresh", () => {
  assert.deepEqual(
    resolvePostLikePresentation(false, 0, {
      liked: true,
      likeCount: 8,
      pending: false,
      updatedAt: 100,
    }, false),
    { liked: true, likeCount: 8 },
  );
});

test("a fresh server snapshot replaces an older confirmed cache", () => {
  assert.deepEqual(
    resolvePostLikePresentation(false, 9, {
      liked: true,
      likeCount: 10,
      pending: false,
      updatedAt: 100,
    }, true, 200),
    { liked: false, likeCount: 9 },
  );
});
