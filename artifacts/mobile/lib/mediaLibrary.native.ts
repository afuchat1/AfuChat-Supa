import * as MediaLibrary from "expo-media-library";

export type MediaLibraryModule = typeof MediaLibrary;

export function getMediaLibrary(): MediaLibraryModule {
  return MediaLibrary;
}