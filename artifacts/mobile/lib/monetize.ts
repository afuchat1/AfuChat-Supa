import { supabase } from "./supabase";

export type MonetizeFeature = {
  id: string;
  title: string;
  emoji: string;
  description: string;
  color: string;
  category: "messaging" | "profile" | "content" | "marketplace" | "community";
};

export const MONETIZE_FEATURES: MonetizeFeature[] = [
  { id: "paid_chat", title: "Paid Chat Requests", emoji: "💬", description: "Charge others to start a conversation with you", color: "#34A853", category: "messaging" },
  { id: "pay_per_message", title: "Pay Per Message", emoji: "✉️", description: "Charge a fee for every message sent to you", color: "#007AFF", category: "messaging" },
  { id: "paid_voice_notes", title: "Paid Voice Notes", emoji: "🎙️", description: "Lock your voice messages behind a paywall", color: "#5856D6", category: "messaging" },
  { id: "paid_broadcast", title: "Paid Broadcasts", emoji: "📡", description: "Send premium messages followers pay to unlock", color: "#AF52DE", category: "messaging" },
  { id: "profile_view", title: "Profile View Payment", emoji: "👁️", description: "Charge to view your full profile or exclusive sections", color: "#FF9500", category: "profile" },
  { id: "username_market", title: "Username Marketplace", emoji: "🏷️", description: "Buy and sell rare and valuable usernames", color: "#D4A853", category: "profile" },
  { id: "digital_badges", title: "Digital Badges", emoji: "🎖️", description: "Create and sell custom badges that appear on profiles", color: "#FF3B30", category: "profile" },
  { id: "paid_live", title: "Paid Live Streams", emoji: "🎥", description: "Host live streams with paid entry and paid reactions", color: "#FF2D55", category: "content" },
  { id: "paid_link", title: "Paid Link Access", emoji: "🔗", description: "Share exclusive links locked behind a paywall", color: "#34C759", category: "content" },
  { id: "content_licensing", title: "Content Licensing", emoji: "📜", description: "Sell rights to use your posts and media", color: "#30B0C7", category: "content" },
  { id: "ai_marketplace", title: "AI Tool Marketplace", emoji: "🤖", description: "Sell custom AI prompts and tools others pay to use", color: "#34A853", category: "marketplace" },
  { id: "rewarded_polls", title: "Rewarded Polls", emoji: "📊", description: "Create polls where voters earn small rewards", color: "#FFD60A", category: "marketplace" },
  { id: "paid_communities", title: "Paid Communities", emoji: "🏰", description: "Private groups that require payment to join", color: "#BF5AF2", category: "community" },
  { id: "digital_events", title: "Digital Event Tickets", emoji: "🎫", description: "Create events and sell access tickets", color: "#FF6B35", category: "community" },
  { id: "freelance", title: "Freelance Market", emoji: "💼", description: "Offer services and get paid directly inside chat", color: "#32D74B", category: "community" },
];

export type TransferResult = { success: boolean; error?: string };

export async function transferAcoin(params: {
  buyerId: string;
  sellerId: string;
  buyerCurrentAcoin: number;
  amount: number;
  transactionType: string;
  metadata?: Record<string, any>;
}): Promise<TransferResult> {
  const { buyerId, sellerId, buyerCurrentAcoin, amount, transactionType, metadata } = params;

  if (buyerCurrentAcoin < amount) {
    return { success: false, error: "Insufficient ACoin balance" };
  }
  if (amount <= 0) {
    return { success: false, error: "Invalid amount" };
  }

  // Deduct from buyer
  const { error: deductErr } = await supabase
    .from("profiles")
    .update({ acoin: buyerCurrentAcoin - amount })
    .eq("id", buyerId);

  if (deductErr) return { success: false, error: deductErr.message };

  // Credit seller (fetch current first to avoid race)
  const { data: sellerData } = await supabase
    .from("profiles")
    .select("acoin")
    .eq("id", sellerId)
    .single();

  await supabase
    .from("profiles")
    .update({ acoin: (sellerData?.acoin || 0) + amount })
    .eq("id", sellerId);

  // Log both sides
  await supabase.from("acoin_transactions").insert([
    { user_id: buyerId, amount: -amount, transaction_type: transactionType, metadata: metadata ?? {} },
    { user_id: sellerId, amount, transaction_type: transactionType, metadata: metadata ?? {} },
  ]);

  return { success: true };
}

export function formatAcoin(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
