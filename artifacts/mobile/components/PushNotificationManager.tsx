import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  registerForPushNotifications,
  setupNotificationChannels,
  setupNotificationListeners,
  clearBadge,
} from "@/lib/pushNotifications";

export function PushNotificationManager() {
  const { user } = useAuth();
  const registered = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    setupNotificationChannels();
  }, []);

  useEffect(() => {
    if (!user || registered.current || Platform.OS === "web") return;

    registered.current = true;
    registerForPushNotifications(user.id).catch(() => {});
    const cleanup = setupNotificationListeners();

    return () => {
      cleanup();
      registered.current = false;
    };
  }, [user]);

  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        clearBadge();
        registerForPushNotifications(user.id).catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [user]);

  return null;
}
