type SubscriptionLike = {
  plan_tier?: string | null;
  is_active?: boolean | null;
  expires_at?: string | null;
} | null | undefined;

export function getActivePlanTier(subscription: SubscriptionLike): string {
  if (!subscription || subscription.is_active === false) return "free";
  if (subscription.expires_at && new Date(subscription.expires_at).getTime() <= Date.now()) return "free";
  return (subscription.plan_tier || "free").toLowerCase();
}

export function isVerifiedCreator(
  manuallyVerified: boolean | null | undefined,
  subscription: SubscriptionLike,
): boolean {
  if (manuallyVerified) return true;
  return ["silver", "gold", "platinum"].includes(getActivePlanTier(subscription));
}

export function canPrioritizeDiscover(subscription: SubscriptionLike): boolean {
  return ["silver", "gold", "platinum"].includes(getActivePlanTier(subscription));
}

export function getSubscriptionPrice(tier: string, databasePrice?: number | null): number | null {
  const normalized = tier.toLowerCase();
  if (normalized === "silver" || normalized === "standard") return 299;
  if (normalized === "gold" || normalized === "pro") return 599;
  if (normalized === "platinum" && Number.isSafeInteger(databasePrice) && Number(databasePrice) >= 0) {
    return Number(databasePrice);
  }
  return null;
}
