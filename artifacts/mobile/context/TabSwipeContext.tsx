import React, { createContext, useContext, useMemo } from "react";
import { useSharedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

export type TabSwipeCtxType = {
  horizontalScrollActive: SharedValue<boolean>;
};

export const TabSwipeContext = createContext<TabSwipeCtxType>({
  horizontalScrollActive: { value: false } as SharedValue<boolean>,
});

export function TabSwipeProvider({ children }: { children: React.ReactNode }) {
  const horizontalScrollActive = useSharedValue(false);
  const ctx = useMemo(() => ({ horizontalScrollActive }), [horizontalScrollActive]);
  return (
    <TabSwipeContext.Provider value={ctx}>
      {children}
    </TabSwipeContext.Provider>
  );
}

export function useHorizontalScrollLock(): SharedValue<boolean> {
  return useContext(TabSwipeContext).horizontalScrollActive;
}
