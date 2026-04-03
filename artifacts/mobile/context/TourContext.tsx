import React, { createContext, useCallback, useContext, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const TOUR_KEY = "afu_tour_v2_seen";

export type TargetLayout = { x: number; y: number; w: number; h: number };

export type TourStepDef = {
  id: string;
  targetId: string;
  title: string;
  description: string;
  hint: string;
  placement: "above" | "below" | "left" | "right";
};

export const TOUR_STEPS: TourStepDef[] = [
  {
    id: "discover",
    targetId: "tab-discover",
    title: "Explore AfuChat",
    description: "Browse posts, articles, and trending content from your community.",
    hint: "Tap the Discover tab",
    placement: "above",
  },
  {
    id: "create",
    targetId: "fab-create",
    title: "Share Your Voice",
    description: "Create a post, article, or short video to share with everyone.",
    hint: "Tap the + button",
    placement: "left",
  },
  {
    id: "chat",
    targetId: "tab-chat",
    title: "Start a Conversation",
    description: "Message friends privately or jump into group chats.",
    hint: "Tap the AfuChat tab",
    placement: "above",
  },
  {
    id: "apps",
    targetId: "tab-apps",
    title: "Discover More",
    description: "Access AfuAI, your wallet, freelance tools, and more.",
    hint: "Tap the Apps tab",
    placement: "above",
  },
];

type TourCtx = {
  isActive: boolean;
  stepIndex: number;
  step: TourStepDef | null;
  totalSteps: number;
  layouts: Record<string, TargetLayout>;
  registerLayout: (id: string, layout: TargetLayout) => void;
  advance: () => void;
  skip: () => void;
  startTour: () => void;
};

const TourContext = createContext<TourCtx>({
  isActive: false,
  stepIndex: 0,
  step: null,
  totalSteps: TOUR_STEPS.length,
  layouts: {},
  registerLayout: () => {},
  advance: () => {},
  skip: () => {},
  startTour: () => {},
});

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [layouts, setLayouts] = useState<Record<string, TargetLayout>>({});

  const registerLayout = useCallback((id: string, layout: TargetLayout) => {
    setLayouts((prev) => {
      const cur = prev[id];
      if (
        cur &&
        cur.x === layout.x &&
        cur.y === layout.y &&
        cur.w === layout.w &&
        cur.h === layout.h
      )
        return prev;
      return { ...prev, [id]: layout };
    });
  }, []);

  const complete = useCallback(async () => {
    setIsActive(false);
    setStepIndex(0);
    await AsyncStorage.setItem(TOUR_KEY, "1");
  }, []);

  const advance = useCallback(() => {
    setStepIndex((prev) => {
      const next = prev + 1;
      if (next >= TOUR_STEPS.length) {
        complete();
        return 0;
      }
      return next;
    });
  }, [complete]);

  const skip = complete;

  const startTour = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const step = isActive ? (TOUR_STEPS[stepIndex] ?? null) : null;

  return (
    <TourContext.Provider
      value={{
        isActive,
        stepIndex,
        step,
        totalSteps: TOUR_STEPS.length,
        layouts,
        registerLayout,
        advance,
        skip,
        startTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  return useContext(TourContext);
}
