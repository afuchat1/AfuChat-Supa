// @ts-nocheck
import { Platform } from "react-native";
import { router } from "expo-router";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";

const EAS_PROJECT_ID = "b55c5d92-7a83-472f-b660-d1838efba5fe";

let _lastRegistrationError: string | null = null;
export function getLastPushRegistrationError(): string | null { return _lastRegistrationError; }

const _handledIds = new Set<string>();
function alreadyHandled(id: string): boolean {
  if (_handledIds.has(id)) return true;
  _handledIds.add(id);
  if (_handledIds.size > 50) {
    const first = _handledIds.values().next().value as string;
    _handledIds.delete(first);
  }
  return false;
}

let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

if (Platform.OS !== "web") {
  try {
    const origError = console.error;
    console.error = (...args: any[]) => {
      if (typeof args[0] === "string" && args[0].includes("removed from Expo Go")) return;
      origError(...args);
    };
    Notifications = require("expo-notifications");
    Device = require("expo-device");
    console.error = origError;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      }),
    });
  } catch {
    Notifications = null;
    Device = null;
  }
}

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00BCD4",
      sound: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      bypassDnd: false,
    });

    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      description: "Chat messages from your contacts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250],
      sound: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lightColor: "#00BCD4",
      bypassDnd: false,
    });

    await Notifications.setNotificationChannelAsync("social", {
      name: "Social",
      description: "Likes, follows, and replies",
      importance: Notifications.AndroidImportance.HIGH,
      sound: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      bypassDnd: false,
    });

    await Notifications.setNotificationChannelAsync("marketplace", {
      name: "Marketplace & Payments",
      description: "Orders, escrow releases, disputes, and payments",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#34C759",
      sound: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      bypassDnd: false,
    });

    await Notifications.setNotificationChannelAsync("system", {
      name: "System & Account",
      description: "Account updates, verifications, and admin messages",
      importance: Notifications.AndroidImportance.HIGH,
      sound: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: false,
      bypassDnd: false,
    });
  } catch (e) {
    console.warn("[PushNotif] Channel setup failed:", e);
  }
}

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === "web" || !Notifications || !Device) return null;
  try {
    if (!Device.isDevice) {
      return null;
    }

    await setupNotificationChannels();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowDisplayInCarPlay: false,
          allowCriticalAlerts: false,
          provideAppNotificationSettings: false,
          allowProvisional: false,
          allowAnnouncements: false,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID || EAS_PROJECT_ID;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Primary: save via server-side edge function (uses service role key, always works)
    let savedViaEdge = false;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken && supabaseUrl) {
        const res = await fetch(`${supabaseUrl}/functions/v1/register-push-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseAnonKey,
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          savedViaEdge = true;
        } else {
          const errText = await res.text();
          console.warn("[PushNotif] Edge function token save failed:", errText);
        }
      }
    } catch (edgeErr: any) {
      console.warn("[PushNotif] Edge function unreachable:", edgeErr?.message);
    }

    // Fallback: direct Supabase client update
    if (!savedViaEdge) {
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ expo_push_token: token })
        .eq("id", userId);

      if (dbError) {
        console.warn("[PushNotif] Fallback DB save failed:", dbError.message);
      }
    }

    return token;
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg?.includes?.("removed from Expo Go")) {
      _lastRegistrationError = "Not available in Expo Go";
    } else {
      console.warn("[PushNotif] Registration failed:", msg);
      _lastRegistrationError = msg;
    }
    return null;
  }
}

export async function clearPushToken(userId: string): Promise<void> {
  await supabase
    .from("profiles")
    .update({ expo_push_token: null })
    .eq("id", userId);
}

function routeNotificationResponse(response: any) {
  const id = response.notification.request.identifier;
  if (alreadyHandled(id)) return;

  const data = (response.notification.request.content.data || {}) as Record<string, string>;
  // Priority 1: explicit deep-link URL
  if (data?.url) {
    router.push(data.url as any);
    return;
  }
  // Priority 2: type-based routing
  switch (data?.type) {
    case "message":
      if (data.chatId) router.push(`/chat/${data.chatId}` as any);
      break;
    case "order":
    case "escrow":
      if (data.orderId) router.push(`/shop/order/${data.orderId}` as any);
      else router.push("/shop/my-orders" as any);
      break;
    case "payment":
      router.push("/(tabs)/me" as any);
      break;
    case "channel":
    case "live":
      router.push("/channel/intro" as any);
      break;
    case "follow":
      if (data.userId) router.push(`/contact/${data.userId}` as any);
      else router.push("/notifications" as any);
      break;
    case "like":
    case "reply":
    case "mention":
      if (data.postId) router.push(`/post/${data.postId}` as any);
      else router.push("/notifications" as any);
      break;
    case "gift":
      router.push("/notifications" as any);
      break;
    default:
      break;
  }
}

let _listenersActive = false;

export function setupNotificationListeners() {
  if (Platform.OS === "web" || !Notifications) return () => {};
  if (_listenersActive) return () => {};
  _listenersActive = true;

  // Drain any pending cold-start response (e.g. app launched by tapping notification).
  // This marks the ID as handled so the addNotificationResponseReceivedListener
  // replay on the same session doesn't re-route.
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) routeNotificationResponse(response);
  }).catch(() => {});

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => routeNotificationResponse(response),
  );

  return () => {
    responseSubscription.remove();
    _listenersActive = false;
  };
}

export async function sendPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .eq("id", params.userId)
      .single();

    if (!profile?.expo_push_token) return;

    const channelId =
      params.data?.type === "message"
        ? "messages"
        : params.data?.type === "follow" ||
          params.data?.type === "like" ||
          params.data?.type === "reply"
        ? "social"
        : "default";

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({
        to: profile.expo_push_token,
        title: params.title,
        body: params.body,
        data: params.data || {},
        sound: "default",
        badge: 1,
        priority: "high",
        channelId,
        ttl: 604800,
        expiration: Math.floor(Date.now() / 1000) + 604800,
      }),
    });

    const json = await res.json();
    if (json?.data?.status === "error") {
      console.warn("[PushNotif] Send error:", json.data.message, json.data.details);
    }
  } catch (error) {
    console.error("[PushNotif] Send failed:", error);
  }
}

export async function getBadgeCount(): Promise<number> {
  if (Platform.OS === "web" || !Notifications) return 0;
  return Notifications.getBadgeCountAsync();
}

export async function clearBadge(): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  await Notifications.setBadgeCountAsync(0);
}
