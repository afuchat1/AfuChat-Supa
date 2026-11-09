import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import {
  addNotificationResponseListener,
  clearLastNotificationResponse,
  configurePushNotifications,
  getLastNotificationResponse,
  getNotificationTarget,
  handleNotificationResponse,
  registerPushToken,
  PUSH_ACTION_ACCEPT_CALL,
  PUSH_ACTION_DEFAULT,
  PUSH_ACTION_OPEN,
} from "@/lib/pushNotifications";

export default function PushNotificationManager() {
  const { user, session, profile } = useAuth();

  useEffect(() => {
    if (Platform.OS === "web" || !user?.id || session?.user?.id !== user.id) return;
    configurePushNotifications();
    let active = true;
    const handleResponse = async (response: any) => {
      if (!active) return;
      try {
        await handleNotificationResponse(
          response,
          user.id,
          profile?.display_name ?? "AfuChat user",
          profile?.avatar_url ?? null,
        );
        const target = getNotificationTarget(response);
        const shouldOpen =
          response.actionIdentifier === PUSH_ACTION_OPEN ||
          response.actionIdentifier === PUSH_ACTION_DEFAULT ||
          response.actionIdentifier === PUSH_ACTION_ACCEPT_CALL;
        if (shouldOpen) {
          if (response.actionIdentifier === PUSH_ACTION_ACCEPT_CALL && target.callId) {
            safeRouter.push({ pathname: "/call/[id]", params: { id: target.callId } } as any);
          } else if (target.chatId) {
            safeRouter.push({
              pathname: "/chat/[id]",
              params: {
                id: target.chatId,
                ...(target.messageId ? { messageId: target.messageId } : {}),
              },
            } as any);
          } else if (target.route) {
            safeRouter.push({
              pathname: target.route as any,
              params: target.entityId ? { id: target.entityId } : undefined,
            } as any);
          }
        }
      } finally {
        clearLastNotificationResponse();
      }
    };
    const responseSubscription = addNotificationResponseListener((response) => {
      void handleResponse(response);
    });
    getLastNotificationResponse().then((response) => {
      if (response) void handleResponse(response);
    }).catch(() => {});
    const register = () => {
      if (active) registerPushToken().catch((error) => {
        if (__DEV__) console.warn("[push] registration failed", error);
      });
    };
    const timer = setTimeout(register, 1500);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") register();
    });
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
      responseSubscription?.remove();
    };
  }, [user?.id, session?.user?.id, profile?.display_name, profile?.avatar_url]);

  return null;
}