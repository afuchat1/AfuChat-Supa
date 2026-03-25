import { supabase } from "./supabase";

export async function getAcoinBalance(userId: string): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("acoin")
    .eq("id", userId)
    .single();
  return data?.acoin ?? 0;
}

export async function spendAcoin(
  userId: string,
  amount: number,
  description: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("acoin")
    .eq("id", userId)
    .single();

  if (!profile || profile.acoin < amount) return false;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ acoin: profile.acoin - amount })
    .eq("id", userId);

  if (updateError) return false;

  await supabase.from("acoin_transactions").insert({
    user_id: userId,
    amount: -amount,
    transaction_type: "game_purchase",
    metadata: { description },
  });

  return true;
}

export const GAME_PRICES = {
  extraLife: 5,
  continueGame: 10,
  powerUp: 3,
  skipLevel: 15,
  undoMove: 2,
  revealCell: 3,
  slowDown: 5,
  shield: 5,
} as const;
