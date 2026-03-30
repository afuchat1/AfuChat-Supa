import { supabase } from "./supabase";

export const MATCH_PRICES = {
  GIFT: 2,
  SUPER_LIKE: 5,
  BOOST_30MIN: 50,
  FREE_SUPER_LIKES_PER_DAY: 3,
} as const;

export async function getAcoinBalance(userId: string): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("acoin")
    .eq("id", userId)
    .single();
  return data?.acoin ?? 0;
}

export async function deductAcoins(
  userId: string,
  amount: number,
  transactionType: string,
  metadata: Record<string, any>
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  if (amount <= 0) return { success: false, error: "Invalid amount" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("acoin")
    .eq("id", userId)
    .single();

  if (!profile) return { success: false, error: "Profile not found" };
  if (profile.acoin < amount) {
    return { success: false, error: `Insufficient ACoins. You need ${amount} AC but have ${profile.acoin} AC.` };
  }

  const newBalance = profile.acoin - amount;

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ acoin: newBalance })
    .eq("id", userId);

  if (updateErr) return { success: false, error: "Failed to deduct ACoins" };

  await supabase.from("acoin_transactions").insert({
    user_id: userId,
    amount: -amount,
    transaction_type: transactionType,
    fee_charged: 0,
    metadata: { ...metadata, processed_at: new Date().toISOString() },
  });

  return { success: true, newBalance };
}

export async function chargeMatchGift(
  userId: string,
  giftEmoji: string,
  recipientName: string,
  matchId: string
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  return deductAcoins(userId, MATCH_PRICES.GIFT, "match_gift", {
    gift_emoji: giftEmoji,
    recipient_name: recipientName,
    match_id: matchId,
    description: `Sent ${giftEmoji} gift in AfuMatch`,
  });
}

export async function chargeMatchSuperLike(
  userId: string,
  targetName: string
): Promise<{ success: boolean; error?: string; newBalance?: number; wasFree?: boolean }> {
  const todayKey = new Date().toISOString().slice(0, 10);
  const { count } = await supabase
    .from("match_swipes")
    .select("id", { count: "exact", head: true })
    .eq("swiper_id", userId)
    .eq("direction", "superlike")
    .gte("created_at", `${todayKey}T00:00:00.000Z`);

  const todayCount = count ?? 0;

  if (todayCount < MATCH_PRICES.FREE_SUPER_LIKES_PER_DAY) {
    return { success: true, wasFree: true };
  }

  const result = await deductAcoins(userId, MATCH_PRICES.SUPER_LIKE, "match_super_like", {
    target_name: targetName,
    description: `Super Liked ${targetName} in AfuMatch`,
  });
  return { ...result, wasFree: false };
}

export async function chargeProfileBoost(
  userId: string
): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  return deductAcoins(userId, MATCH_PRICES.BOOST_30MIN, "match_boost", {
    duration_minutes: 30,
    description: "AfuMatch profile boost (30 minutes)",
  });
}
