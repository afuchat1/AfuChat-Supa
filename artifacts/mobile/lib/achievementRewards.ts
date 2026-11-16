import { supabase } from "./supabase";

export type AchievementRewardSyncResult = {
  xpAwarded: number;
  newBalance: number;
  rewardedAchievementIds: string[];
};

type RewardRpcResponse = {
  success?: boolean;
  reason?: string;
  xp_awarded?: number;
  new_balance?: number;
  rewarded_achievement_ids?: string[];
};

let lastSyncAt = 0;
let lastSyncResult: AchievementRewardSyncResult | null = null;
let inFlightSync: Promise<AchievementRewardSyncResult> | null = null;
const MIN_SYNC_INTERVAL_MS = 30_000;

/**
 * Ask Supabase to award every currently eligible achievement exactly once.
 * Eligibility and XP amounts are checked server-side; this client supplies no
 * achievement IDs or reward values.
 */
export function syncAchievementRewards(
  options: { force?: boolean } = {},
): Promise<AchievementRewardSyncResult> {
  if (inFlightSync) return inFlightSync;

  const now = Date.now();
  if (
    !options.force &&
    lastSyncResult &&
    now - lastSyncAt < MIN_SYNC_INTERVAL_MS
  ) {
    return Promise.resolve(lastSyncResult);
  }

  lastSyncAt = now;
  inFlightSync = (async () => {
    const { data, error } = await supabase.rpc("claim_achievement_rewards");
    if (error) throw error;

    const response = data as RewardRpcResponse | null;
    if (!response?.success) {
      throw new Error(response?.reason || "Achievement reward sync failed");
    }

    const result = {
      xpAwarded: Number(response.xp_awarded ?? 0),
      newBalance: Number(response.new_balance ?? 0),
      rewardedAchievementIds: Array.isArray(response.rewarded_achievement_ids)
        ? response.rewarded_achievement_ids.filter((id): id is string => typeof id === "string")
        : [],
    };

    lastSyncResult = result;
    return result;
  })().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
}
