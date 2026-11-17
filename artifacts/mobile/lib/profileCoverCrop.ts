export type ProfileCoverCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export const PROFILE_COVER_ASPECT_RATIO = 2;

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

  const aspectRatio = PROFILE_COVER_ASPECT_RATIO;
  const cropWidth = Math.max(
    aspectRatio,
    Math.floor(
      Math.min(sourceWidth, sourceHeight * aspectRatio, viewportWidth / scale) / aspectRatio,
    ) * aspectRatio,
  );
  const cropHeight = cropWidth / aspectRatio;

  return {
    originX: clamp(Math.round(-left / scale), 0, sourceWidth - cropWidth),
    originY: clamp(Math.round(-top / scale), 0, sourceHeight - cropHeight),
    width: cropWidth,
    height: cropHeight,
  };
}
