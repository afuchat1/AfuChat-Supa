import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type GiftStat = {
  multiplier: number;
  totalSent: number;
  lastSalePrice: number | null;
};

type StatsMap = Record<string, GiftStat>;

export function useGiftPrices() {
  const [statsMap, setStatsMap] = useState<StatsMap>({});
  const mapRef = useRef<StatsMap>({});

  const loadStats = useCallback(async () => {
    const { data } = await supabase
      .from("gift_statistics")
      .select("gift_id, price_multiplier, total_sent, last_sale_price");
    if (data) {
      const m: StatsMap = {};
      data.forEach((s: any) => {
        m[s.gift_id] = {
          multiplier: parseFloat(s.price_multiplier) || 1,
          totalSent: s.total_sent || 0,
          lastSalePrice: s.last_sale_price ?? null,
        };
      });
      mapRef.current = m;
      setStatsMap(m);
    }
  }, []);

  useEffect(() => {
    loadStats();

    const channel = supabase
      .channel("gift_statistics_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gift_statistics" },
        (payload: any) => {
          const row = payload.new;
          if (!row?.gift_id) return;
          const updated: GiftStat = {
            multiplier: parseFloat(row.price_multiplier) || 1,
            totalSent: row.total_sent || 0,
            lastSalePrice: row.last_sale_price ?? null,
          };
          const next = { ...mapRef.current, [row.gift_id]: updated };
          mapRef.current = next;
          setStatsMap(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStats]);

  const getDynamicPrice = useCallback(
    (giftId: string, baseXpCost: number): number => {
      const stat = mapRef.current[giftId];
      if (!stat) return baseXpCost;
      const multiplierPrice = Math.ceil(baseXpCost * stat.multiplier);
      const lastSale = stat.lastSalePrice ?? 0;
      return Math.max(multiplierPrice, lastSale);
    },
    []
  );

  const refreshStats = loadStats;

  return { statsMap, getDynamicPrice, refreshStats };
}
