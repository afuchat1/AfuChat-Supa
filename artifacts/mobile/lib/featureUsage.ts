import AsyncStorage from "@react-native-async-storage/async-storage";

export type FeatureKey =
  | "stories_create"
  | "afuai_messages"
  | "group_create"
  | "channel_create";

const DAILY_LIMITS: Record<FeatureKey, number> = {
  stories_create: 5,
  afuai_messages: 10,
  group_create: 3,
  channel_create: 2,
};

function todayKey(feature: FeatureKey): string {
  const d = new Date().toISOString().slice(0, 10);
  return `fu_${feature}_${d}`;
}

export async function getUsage(
  feature: FeatureKey
): Promise<{ count: number; limit: number; remaining: number; allowed: boolean }> {
  const limit = DAILY_LIMITS[feature];
  try {
    const raw = await AsyncStorage.getItem(todayKey(feature));
    const count = raw ? parseInt(raw, 10) : 0;
    return {
      count,
      limit,
      remaining: Math.max(0, limit - count),
      allowed: count < limit,
    };
  } catch {
    return { count: 0, limit, remaining: limit, allowed: true };
  }
}

export async function recordUsage(feature: FeatureKey): Promise<void> {
  try {
    const key = todayKey(feature);
    const raw = await AsyncStorage.getItem(key);
    const count = raw ? parseInt(raw, 10) : 0;
    await AsyncStorage.setItem(key, String(count + 1));
  } catch {}
}
