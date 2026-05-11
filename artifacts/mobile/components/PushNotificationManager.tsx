import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  registerForPushNotifications,
  setupNotificationChannels,
  setupNotificationListeners,
  clearBadge,
} from "@/lib/pushNotifications";
import { showBanner } from "@/lib/notifBannerStore";

const RE_REGISTER_COOLDOWN_MS = 10 * 60 * 1000;

// Notification types handled by their own native UI — skip the in-app banner for these
const BANNER_SKIP_TYPES = new Set(["call", "snoozed"]);

export function PushNotificationManager() {
  const { user } = useAuth();
  const registered = useRef(false);
  const lastRegisteredAt = useRef(0);

  useEffect(() => {
    if (Platform.OS === "web") return;
    setupNotificationChannels();
  }, []);

  useEffect(() => {
    if (!user || registered.current || Platform.OS === "web") return;

    registered.current = true;
    lastRegisteredAt.current = Date.now();
    registerForPushNotifications(user.id).catch(() => {});
    const cleanup = setupNotificationListeners();

    return () => {
      cleanup();
      registered.current = false;
    };
  }, [user?.id]);

  // ── In-app foreground banner ───────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    let Notifications: any = null;
    try { Notifications = require("expo-notifications"); } catch { return; }
    if (!Notifications) return;

    const sub = Notifications.addNotificationReceivedListener((notification: any) => {
      const content = notification?.request?.content;
      if (!content) return;

      const data: Record<string, string> = content.data || {};
      const type = data.type || "";

      if (BANNER_SKIP_TYPES.has(type)) return;

      showBanner({
        title: content.title || "AfuChat",
        body: content.body || "",
        type,
        chatId: data.chatId,
        postId: data.postId,
        actorId: data.actorId,
        url: data.url,
        avatarUrl: null,
      });
    });

    return () => sub.remove();
  }, [user?.id]);

  // ── App foreground — clear badge and refresh token ─────────────────
  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        clearBadge();
        const now = Date.now();
        if (now - lastRegisteredAt.current > RE_REGISTER_COOLDOWN_MS) {
          lastRegisteredAt.current = now;
          registerForPushNotifications(user.id).catch(() => {});
        }
      }
    });

    return () => subscription.remove();
  }, [user?.id]);

  return null;
}
