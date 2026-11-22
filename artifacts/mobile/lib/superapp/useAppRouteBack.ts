import { router, useRootNavigationState } from "expo-router";
import { safeRouter } from "@/lib/navUtils";

/**
 * Embedded app screens should return to their parent app route when opened
 * from a tab param, but should preserve normal back history for pushed details.
 */
export function useAppRouteBack(
  appId: string,
  fallbackSection?: string,
  embedded = false,
) {
  const navigationState = useRootNavigationState();
  const previousRoute = navigationState?.routes[navigationState.index - 1];
  const previousParams = previousRoute?.params as Record<string, unknown> | undefined;
  const previousIsSameApp =
    previousRoute?.name === "app/[appId]" && previousParams?.appId === appId;

  return () => {
    if (!embedded) {
      safeRouter.back(`/app/${appId}`);
      return;
    }
    if (previousIsSameApp) {
      router.back();
      return;
    }
    router.setParams({
      section: fallbackSection,
      id: undefined,
      userId: undefined,
      recipientId: undefined,
      initialRecipientId: undefined,
      paymentReference: undefined,
    } as any);
  };
}
