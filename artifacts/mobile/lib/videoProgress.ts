import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "vp:";
const cache = new Map<string, number>();
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

export function getVideoProgressCached(postId: string): number | null {
  return cache.has(postId) ? cache.get(postId)! : null;
}

export async function loadVideoProgress(postId: string): Promise<number | null> {
  if (cache.has(postId)) return cache.get(postId)!;
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + postId);
    if (raw === null) return null;
    const n = parseFloat(raw);
    if (isNaN(n)) return null;
    cache.set(postId, n);
    return n;
  } catch {
    return null;
  }
}

export function saveVideoProgress(postId: string, fraction: number): void {
  if (fraction < 0.02 || fraction > 0.97) return;
  cache.set(postId, fraction);
  if (pendingWrites.has(postId)) clearTimeout(pendingWrites.get(postId)!);
  pendingWrites.set(
    postId,
    setTimeout(() => {
      pendingWrites.delete(postId);
      AsyncStorage.setItem(KEY_PREFIX + postId, String(fraction)).catch(() => {});
    }, 4000)
  );
}

export function clearVideoProgress(postId: string): void {
  cache.delete(postId);
  if (pendingWrites.has(postId)) {
    clearTimeout(pendingWrites.get(postId)!);
    pendingWrites.delete(postId);
  }
  AsyncStorage.removeItem(KEY_PREFIX + postId).catch(() => {});
}
