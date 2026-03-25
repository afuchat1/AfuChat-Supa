import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

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

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

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
    console.log("Push notification permission not granted");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00C2CB",
      sound: "notification.wav",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
    });

    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      description: "Chat messages from your contacts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250],
      sound: "notification.wav",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lightColor: "#00C2CB",
    });

    await Notifications.setNotificationChannelAsync("social", {
      name: "Social",
      description: "Likes, follows, and replies",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "notification.wav",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
    });
  }

  try {
    const projectId =
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
      process.env.EXPO_PUBLIC_REPL_ID;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });
    const token = tokenData.data;

    await supabase
      .from("profiles")
      .update({ expo_push_token: token })
      .eq("id", userId);

    return token;
  } catch (error) {
    console.error("Failed to get push token:", error);
    return null;
  }
}

export async function clearPushToken(userId: string): Promise<void> {
  await supabase
    .from("profiles")
    .update({ expo_push_token: null })
    .eq("id", userId);
}

export function setupNotificationListeners() {
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (data?.url) {
        router.push(data.url as string);
      } else if (data?.chatId) {
        router.push(`/chat/${data.chatId}`);
      } else if (data?.postId) {
        router.push(`/post/${data.postId}`);
      } else if (data?.type === "follow") {
        router.push("/notifications");
      }
    },
  );

  return () => {
    responseSubscription.remove();
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

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: profile.expo_push_token,
        title: params.title,
        body: params.body,
        data: params.data || {},
        sound: "notification.wav",
        badge: 1,
        priority: "high",
        channelId: params.data?.type === "message" ? "messages" : params.data?.type === "follow" || params.data?.type === "like" || params.data?.type === "reply" ? "social" : "default",
      }),
    });
  } catch (error) {
    console.error("Failed to send push notification:", error);
  }
}

export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}
