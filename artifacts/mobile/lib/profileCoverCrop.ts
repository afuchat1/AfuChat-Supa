export type ProfileCoverCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateProfileCoverCropRect(input: {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  offsetX: number;
  offsetY: number;
}): ProfileCoverCropRect {
  const { sourceWidth, sourceHeight, viewportWidth, viewportHeight, offsetX, offsetY } = input;
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const baseLeft = (viewportWidth - renderedWidth) / 2;
  const baseTop = (viewportHeight - renderedHeight) / 2;
  const left = baseLeft + offsetX;
  const top = baseTop + offsetY;

  // Use a multiple of three pixels so the saved crop is exactly 3:1.
  const cropWidth = Math.max(
    3,
    Math.floor(Math.min(sourceWidth, sourceHeight * 3, viewportWidth / scale) / 3) * 3,
  );
  const cropHeight = cropWidth / 3;

  return {
    originX: clamp(Math.round(-left / scale), 0, sourceWidth - cropWidth),
    originY: clamp(Math.round(-top / scale), 0, sourceHeight - cropHeight),
    width: cropWidth,
    height: cropHeight,
  };
}
