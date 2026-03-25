import { supabase } from "./supabase";

const REWARDS: Record<string, { xp: number; cooldown: number }> = {
  profile_completed: { xp: 1000, cooldown: 0 },
  referral: { xp: 2000, cooldown: 0 },
  daily_login: { xp: 20, cooldown: 82800 },
  post_created: { xp: 50, cooldown: 30 },
  post_reply: { xp: 20, cooldown: 10 },
  post_liked: { xp: 5, cooldown: 3 },
  follow_user: { xp: 10, cooldown: 5 },
  message_sent: { xp: 2, cooldown: 30 },
  story_created: { xp: 30, cooldown: 30 },
  story_viewed: { xp: 3, cooldown: 5 },
  gift_sent: { xp: 25, cooldown: 5 },
  group_created: { xp: 50, cooldown: 60 },
  channel_created: { xp: 50, cooldown: 60 },
  red_envelope_sent: { xp: 30, cooldown: 10 },
  red_envelope_claimed: { xp: 10, cooldown: 5 },
};

export async function rewardXp(
  activityType: string,
  metadata: Record<string, any> = {}
): Promise<{ success: boolean; xp_earned?: number; new_balance?: number }> {
  try {
    const config = REWARDS[activityType];
    if (!config) return { success: false };

    const { data } = await supabase.rpc("reward_activity_xp", {
      p_activity_type: activityType,
      p_xp_amount: config.xp,
      p_cooldown_seconds: config.cooldown,
      p_metadata: metadata,
    });

    return data || { success: false };
  } catch {
    return { success: false };
  }
}
