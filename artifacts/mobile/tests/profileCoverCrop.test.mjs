import test from "node:test";
import assert from "node:assert/strict";
import { calculateProfileCoverCropRect } from "../lib/profileCoverCrop.ts";

test("wide images crop to a centered 2:1 cover", () => {
  const crop = calculateProfileCoverCropRect({
    sourceWidth: 4000,
    sourceHeight: 1000,
    viewportWidth: 300,
    viewportHeight: 150,
    offsetX: 0,
    offsetY: 0,
  });

  assert.deepEqual(crop, { originX: 1000, originY: 0, width: 2000, height: 1000 });
});

test("dragging changes the selected area without leaving image bounds", () => {
  const leftCrop = calculateProfileCoverCropRect({
    sourceWidth: 4000,
    sourceHeight: 1000,
    viewportWidth: 300,
    viewportHeight: 150,
    offsetX: 50,
    offsetY: 0,
  });
  const rightCrop = calculateProfileCoverCropRect({
    sourceWidth: 4000,
    sourceHeight: 1000,
    viewportWidth: 300,
    viewportHeight: 150,
    offsetX: -50,
    offsetY: 0,
  });

  assert.ok(leftCrop.originX < rightCrop.originX);
  assert.ok(rightCrop.originX + rightCrop.width <= 4000);
  assert.equal(rightCrop.originY, 0);
});

test("portrait photos allow vertical repositioning and preserve the cover ratio", () => {
  const topCrop = calculateProfileCoverCropRect({
    sourceWidth: 1000,
    sourceHeight: 1500,
    viewportWidth: 300,
    viewportHeight: 150,
    offsetX: 0,
    offsetY: 175,
  });
  const bottomCrop = calculateProfileCoverCropRect({
    sourceWidth: 1000,
    sourceHeight: 1500,
    viewportWidth: 300,
    viewportHeight: 150,
    offsetX: 0,
    offsetY: -175,
  });

  assert.equal(topCrop.originY, 0);
  assert.equal(bottomCrop.originY + bottomCrop.height, 1500);
  assert.equal(topCrop.width / topCrop.height, 2);
  assert.equal(topCrop.originX, 0);
});
