import { useAuth } from "@/context/AuthContext";

export type Tier = "free" | "silver" | "gold" | "platinum";

const TIER_ORDER: Record<string, number> = {
  free: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
};

export const TIER_COLORS: Record<Tier, string> = {
  free: "#8E8E93",
  silver: "#8E9BAD",
  gold: "#D4A853",
  platinum: "#BF5AF2",
};

export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

export function useTier() {
  const { isPremium, subscription } = useAuth();

  const tierLevel = isPremium
    ? (TIER_ORDER[(subscription?.plan_tier ?? "free").toLowerCase()] ?? 0)
    : 0;

  const currentTier = (
    isPremium ? (subscription?.plan_tier ?? "free").toLowerCase() : "free"
  ) as Tier;

  function hasTier(required: Tier): boolean {
    return tierLevel >= (TIER_ORDER[required] ?? 0);
  }

  return { hasTier, currentTier, tierLevel };
}
