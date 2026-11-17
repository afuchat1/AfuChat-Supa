import test from "node:test";
import assert from "node:assert/strict";
import { calculateProfileCoverCropRect } from "../lib/profileCoverCrop.ts";

test("wide images crop to a centered 3:1 cover", () => {
  const crop = calculateProfileCoverCropRect({
    sourceWidth: 4000,
    sourceHeight: 1000,
    viewportWidth: 300,
    viewportHeight: 100,
    offsetX: 0,
    offsetY: 0,
  });

  assert.deepEqual(crop, { originX: 500, originY: 0, width: 3000, height: 1000 });
});

test("dragging changes the selected area without leaving image bounds", () => {
  const leftCrop = calculateProfileCoverCropRect({
    sourceWidth: 4000,
    sourceHeight: 1000,
    viewportWidth: 300,
    viewportHeight: 100,
    offsetX: 50,
    offsetY: 0,
  });
  const rightCrop = calculateProfileCoverCropRect({
    sourceWidth: 4000,
    sourceHeight: 1000,
    viewportWidth: 300,
    viewportHeight: 100,
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
    viewportHeight: 100,
    offsetX: 0,
    offsetY: 175,
  });
  const bottomCrop = calculateProfileCoverCropRect({
    sourceWidth: 1000,
    sourceHeight: 1500,
    viewportWidth: 300,
    viewportHeight: 100,
    offsetX: 0,
    offsetY: -175,
  });

  assert.equal(topCrop.originY, 0);
  assert.equal(bottomCrop.originY + bottomCrop.height, 1500);
  assert.equal(topCrop.width / topCrop.height, 3);
  assert.equal(topCrop.originX, 0);
});

test("square photos crop to a centered landscape strip", () => {
  const crop = calculateProfileCoverCropRect({
    sourceWidth: 1200,
    sourceHeight: 1200,
    viewportWidth: 300,
    viewportHeight: 100,
    offsetX: 0,
    offsetY: 0,
  });

  assert.equal(crop.width / crop.height, 3);
  assert.equal(crop.originX, 0);
  assert.equal(crop.originY, 400);
  assert.ok(crop.originX + crop.width <= 1200);
  assert.ok(crop.originY + crop.height <= 1200);
});
