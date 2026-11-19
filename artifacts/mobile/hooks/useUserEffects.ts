import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type UserEffects = {
  goldNameplate: boolean;
  verifiedStar: boolean;
  crownRing: boolean;
  isPlatinum: boolean;
  voidRing: boolean;
  diamondRing: boolean;
  founderSeal: boolean;
  royaltyTitle: boolean;
  statusGlow: boolean;
};

const EMPTY: UserEffects = {
  goldNameplate: false,
  verifiedStar: false,
  crownRing: false,
  isPlatinum: false,
  voidRing: false,
  diamondRing: false,
  founderSeal: false,
  royaltyTitle: false,
  statusGlow: false,
};

const EFFECT_IDS = ["sg1", "sg2", "sg3", "sg4", "sg5", "sg6", "sg7", "sg8"] as const;

const cache = new Map<string, UserEffects>();
const pending = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();

function notify(userId: string) {
  listeners.get(userId)?.forEach((fn) => fn());
}

function fetchEffects(userId: string): Promise<void> {
  if (cache.has(userId)) return Promise.resolve();
  if (pending.has(userId)) return pending.get(userId)!;

  const goodsPromise = supabase
    .from("status_goods_purchases")
    .select("good_id")
    .eq("user_id", userId)
    .eq("equipped", true)
    .in("good_id", EFFECT_IDS)
    .then(({ data }) => data ?? [], () => [] as any[]);

  const subPromise = supabase
    .from("user_subscriptions")
    .select("subscription_plans(tier)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .then(({ data }) => {
      return (data ?? []).some((s: any) => s.subscription_plans?.tier === "platinum");
    }, () => false);

  const promise = Promise.all([goodsPromise, subPromise]).then(([goodsData, hasPlatinumSubscription]) => {
    const ids = new Set((goodsData as any[]).map((d: any) => d.good_id as string));
    const isPlatinum = hasPlatinumSubscription;
    cache.set(userId, {
      goldNameplate: ids.has("sg4") || isPlatinum,
      verifiedStar: ids.has("sg5"),
      crownRing: ids.has("sg1") && isPlatinum,
      isPlatinum,
      voidRing: ids.has("sg2"),
      diamondRing: ids.has("sg3"),
      founderSeal: ids.has("sg6"),
      royaltyTitle: ids.has("sg7"),
      statusGlow: ids.has("sg8"),
    });
    pending.delete(userId);
    notify(userId);
  }).catch(() => {
    cache.set(userId, { ...EMPTY });
    pending.delete(userId);
    notify(userId);
  });

  pending.set(userId, promise);
  return promise;
}

export function useUserEffects(userId: string | null | undefined): UserEffects {
  const [effects, setEffects] = useState<UserEffects>(() =>
    userId ? (cache.get(userId) ?? { ...EMPTY }) : { ...EMPTY }
  );

  useEffect(() => {
    if (!userId) {
      setEffects({ ...EMPTY });
      return;
    }

    if (cache.has(userId)) {
      setEffects(cache.get(userId)!);
      return;
    }

    setEffects({ ...EMPTY });
    let mounted = true;
    const listener = () => {
      if (mounted) setEffects(cache.get(userId) ?? { ...EMPTY });
    };

    if (!listeners.has(userId)) listeners.set(userId, new Set());
    listeners.get(userId)!.add(listener);
    fetchEffects(userId);

    return () => {
      listeners.get(userId)?.delete(listener);
      mounted = false;
    };
  }, [userId]);

  return effects;
}

export function invalidateUserEffects(userId: string) {
  cache.delete(userId);
  if (listeners.has(userId)) void fetchEffects(userId);
}

export type { UserEffects as UserEffectsType };
