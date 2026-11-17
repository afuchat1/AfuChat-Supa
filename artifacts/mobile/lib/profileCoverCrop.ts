export type ProfileCoverCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export const PROFILE_COVER_ASPECT_RATIO = 3;
export const PROFILE_COVER_OUTPUT_WIDTH = 1200;
export const PROFILE_COVER_OUTPUT_HEIGHT = PROFILE_COVER_OUTPUT_WIDTH / PROFILE_COVER_ASPECT_RATIO;
export const PROFILE_COVER_DISPLAY_HEIGHT = 144;

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
  const maxCropWidth = Math.min(sourceWidth, sourceHeight * aspectRatio, viewportWidth / scale);
  const cropWidth = Math.max(1, Math.floor(maxCropWidth / aspectRatio) * aspectRatio);
  const cropHeight = cropWidth / aspectRatio;

  return {
    originX: clamp(Math.round(-left / scale), 0, Math.max(0, sourceWidth - cropWidth)),
    originY: clamp(Math.round(-top / scale), 0, Math.max(0, sourceHeight - cropHeight)),
    width: cropWidth,
    height: cropHeight,
  };
}
