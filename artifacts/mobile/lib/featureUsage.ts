import AsyncStorage from "@react-native-async-storage/async-storage";

export type DailyFeatureKey = "stories_create" | "afuai_messages";
export type Tier = "free" | "silver" | "gold" | "platinum";

export const TIER_DAILY_LIMITS: Record<DailyFeatureKey, Record<Tier, number>> = {
  stories_create: { free: 5, silver: 20, gold: 50, platinum: Infinity },
  afuai_messages: { free: 10, silver: 50, gold: 200, platinum: Infinity },
};

export const TIER_GROUP_LIMITS: Record<Tier, number> = {
  free: 1,
  silver: 3,
  gold: 10,
  platinum: Infinity,
};

export const TIER_CHANNEL_LIMITS: Record<Tier, number> = {
  free: 1,
  silver: 3,
  gold: 10,
  platinum: Infinity,
};

function todayKey(feature: DailyFeatureKey): string {
  const d = new Date().toISOString().slice(0, 10);
  return `fu_${feature}_${d}`;
}

export async function getDailyUsage(
  feature: DailyFeatureKey,
  tier: Tier = "free"
): Promise<{ count: number; limit: number; remaining: number; allowed: boolean }> {
  const limit = TIER_DAILY_LIMITS[feature][tier] ?? TIER_DAILY_LIMITS[feature]["free"];
  if (!isFinite(limit)) {
    return { count: 0, limit: Infinity, remaining: Infinity, allowed: true };
  }
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

export async function recordDailyUsage(feature: DailyFeatureKey): Promise<void> {
  try {
    const key = todayKey(feature);
    const raw = await AsyncStorage.getItem(key);
    const count = raw ? parseInt(raw, 10) : 0;
    await AsyncStorage.setItem(key, String(count + 1));
  } catch {}
}
