import { useEffect, useState } from "react";
import { loadVideoProgress, getVideoProgressCached } from "@/lib/videoProgress";

export function useVideoProgress(postId: string): number | null {
  const [fraction, setFraction] = useState<number | null>(() => getVideoProgressCached(postId));

  useEffect(() => {
    let cancelled = false;
    const cached = getVideoProgressCached(postId);
    if (cached !== null) {
      setFraction(cached);
      return;
    }
    loadVideoProgress(postId).then((val) => {
      if (!cancelled) setFraction(val);
    });
    return () => { cancelled = true; };
  }, [postId]);

  return fraction;
}
