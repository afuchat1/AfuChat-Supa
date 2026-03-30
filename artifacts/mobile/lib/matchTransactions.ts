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

export type ReceivedMatchGift = {
  id: string;
  match_id: string;
  sender_id: string;
  sender_name: string;
  gift_emoji: string;
  sent_at: string;
};

export async function getReceivedMatchGifts(userId: string): Promise<ReceivedMatchGift[]> {
  const { data: matches } = await supabase
    .from("match_matches")
    .select("id")
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

  if (!matches || matches.length === 0) return [];

  const matchIds = matches.map((m: any) => m.id);

  const { data: gifts } = await supabase
    .from("match_messages")
    .select("id, match_id, sender_id, gift_emoji, sent_at")
    .in("match_id", matchIds)
    .eq("is_gift", true)
    .neq("sender_id", userId)
    .order("sent_at", { ascending: false });

  if (!gifts || gifts.length === 0) return [];

  const senderIds = [...new Set(gifts.map((g: any) => g.sender_id))] as string[];
  const { data: profiles } = await supabase
    .from("match_profiles")
    .select("user_id, name")
    .in("user_id", senderIds);

  const nameMap: Record<string, string> = {};
  (profiles ?? []).forEach((p: any) => { nameMap[p.user_id] = p.name ?? "Someone"; });

  return gifts.map((g: any) => ({
    id: g.id,
    match_id: g.match_id,
    sender_id: g.sender_id,
    sender_name: nameMap[g.sender_id] ?? "Someone",
    gift_emoji: g.gift_emoji ?? "🎁",
    sent_at: g.sent_at,
  }));
}

export async function getConvertedGiftIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("acoin_transactions")
    .select("metadata")
    .eq("user_id", userId)
    .eq("transaction_type", "match_gift_conversion");

  const ids = new Set<string>();
  (data ?? []).forEach((t: any) => {
    const msgIds: string[] = t.metadata?.message_ids ?? [];
    msgIds.forEach((id) => ids.add(id));
  });
  return ids;
}

export async function convertMatchGiftsToAcoins(
  userId: string,
  messageIds: string[]
): Promise<{ success: boolean; error?: string; credited?: number; fee?: number }> {
  if (messageIds.length === 0) return { success: false, error: "No gifts to convert" };

  const FEE_PERCENT = 5;
  const grossAC = messageIds.length * MATCH_PRICES.GIFT;
  const feeAC = Math.ceil(grossAC * (FEE_PERCENT / 100));
  const netAC = Math.max(1, grossAC - feeAC);

  const { data: profile } = await supabase
    .from("profiles")
    .select("acoin")
    .eq("id", userId)
    .single();

  if (!profile) return { success: false, error: "Profile not found" };

  const newBalance = (profile.acoin ?? 0) + netAC;
  const { error } = await supabase.from("profiles").update({ acoin: newBalance }).eq("id", userId);
  if (error) return { success: false, error: "Failed to credit ACoins" };

  await supabase.from("acoin_transactions").insert({
    user_id: userId,
    amount: netAC,
    transaction_type: "match_gift_conversion",
    fee_charged: feeAC,
    metadata: {
      message_ids: messageIds,
      gift_count: messageIds.length,
      gross_ac: grossAC,
      fee_percent: FEE_PERCENT,
      description: `Converted ${messageIds.length} AfuMatch gift${messageIds.length > 1 ? "s" : ""} to ACoins`,
    },
  });

  return { success: true, credited: netAC, fee: feeAC };
}
