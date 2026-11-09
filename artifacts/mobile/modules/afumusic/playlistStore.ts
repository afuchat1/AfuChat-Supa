import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AfuMusicTrack } from "@/modules/afumusic";

export type AfuMusicPlaylist = {
  id: string;
  name: string;
  tracks: AfuMusicTrack[];
  updatedAt: string;
};

const keyFor = (userId: string) => `@afumusic:playlists:v1:${userId}`;

export async function loadMusicPlaylists(userId: string): Promise<AfuMusicPlaylist[]> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is AfuMusicPlaylist =>
      !!item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      Array.isArray(item.tracks) &&
      typeof item.updatedAt === "string",
    );
  } catch {
    return [];
  }
}

export async function saveMusicPlaylists(userId: string, playlists: AfuMusicPlaylist[]) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(playlists));
}
