export type MediaLibraryModule = typeof import("expo-media-library");

// Metro selects the .native.ts or .web.ts implementation for the running
// platform. This base implementation keeps TypeScript resolution stable.
export function getMediaLibrary(): MediaLibraryModule | null {
  return null;
}