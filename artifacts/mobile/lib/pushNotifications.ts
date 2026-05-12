// @ts-nocheck
import { Platform } from "react-native";
import { router } from "expo-router";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { getPushSoundToken } from "@/lib/soundManager";
import { handleNotificationAction } from "@/lib/notificationActions";

const EAS_PROJECT_ID = "784a87ad-e3d1-438c-9c84-1b336f4fd2d2";

// AfuChat branded sound — kept for reference (used only in call ringtone flow).
// Android notification channels use device default sound instead.
const AFUCHAT_SOUND = "notification.wav";

// ── Notification Category IDs ─────────────────────────────────────────
export const NOTIF_CATEGORY = {
  MESSAGE_REPLY:   "afuchat_message_reply",
  POST_INTERACT:   "afuchat_post_interact",
  NEW_FOLLOWER:    "afuchat_new_follower",
  ORDER_UPDATE:    "afuchat_order_update",
  ORDER_SHIPPED:   "afuchat_order_shipped",
  INCOMING_CALL:   "afuchat_incoming_call",
  GIFT_RECEIVED:   "afuchat_gift_received",
  MENTION:         "afuchat_mention",
} as const;

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

// ─────────────────────────────────────────────────────────────────────
// Notification Categories (action buttons in status bar)
// ─────────────────────────────────────────────────────────────────────

export async function setupNotificationCategories(): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    // ── Chat message: inline reply + mark read + snooze ──────────────
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.MESSAGE_REPLY, [
      {
        identifier: "chat_reply",
        buttonTitle: "Reply",
        options: { opensAppToForeground: false },
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Type a message…",
        },
      },
      {
        identifier: "mark_read",
        buttonTitle: "Mark Read",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "snooze_1h",
        buttonTitle: "Snooze 1h",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);

    // ── Post / mention: inline reply + like + view ────────────────────
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.POST_INTERACT, [
      {
        identifier: "post_reply",
        buttonTitle: "Reply",
        options: { opensAppToForeground: false },
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Write your reply…",
        },
      },
      {
        identifier: "like",
        buttonTitle: "❤️ Like",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "view_post",
        buttonTitle: "View Post",
        options: { opensAppToForeground: true },
      },
    ]);

    // ── New follower: follow back + view profile + mark read ──────────
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.NEW_FOLLOWER, [
      {
        identifier: "follow_back",
        buttonTitle: "Follow Back",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "view_profile",
        buttonTitle: "View Profile",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "mark_read",
        buttonTitle: "Dismiss",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);

    // ── Order / marketplace: view order + dismiss ─────────────────────
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.ORDER_UPDATE, [
      {
        identifier: "view_order",
        buttonTitle: "View Order",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "mark_read",
        buttonTitle: "Dismiss",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);

    // ── Shipped order: confirm delivery directly from notification ─────
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.ORDER_SHIPPED, [
      {
        identifier: "confirm_delivery",
        buttonTitle: "✓ Confirm Delivery",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "view_order",
        buttonTitle: "View Order",
        options: { opensAppToForeground: true },
      },
    ]);

    // ── Incoming call: accept (opens app) + decline (background) ──────
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.INCOMING_CALL, [
      {
        identifier: "accept_call",
        buttonTitle: "✅ Accept",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "decline_call",
        buttonTitle: "❌ Decline",
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);

    // ── Gift received: view wallet + thank sender (open profile) ──────
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.GIFT_RECEIVED, [
      {
        identifier: "view_profile",
        buttonTitle: "👤 View Sender",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "mark_read",
        buttonTitle: "Dismiss",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);

    // ── Mention: inline reply + view post ────────────────────────────
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.MENTION, [
      {
        identifier: "post_reply",
        buttonTitle: "Reply",
        options: { opensAppToForeground: false },
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Write your reply…",
        },
      },
      {
        identifier: "like",
        buttonTitle: "❤️ Like",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "view_post",
        buttonTitle: "View Post",
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (e) {
    console.warn("[PushNotif] Category setup failed:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Notification Channels (Android — each branded with AfuChat sound)
// ─────────────────────────────────────────────────────────────────────

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;
  try {
    const base = {
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      bypassDnd: false,
    };

    await Notifications.setNotificationChannelAsync("default", {
      name: "AfuChat",
      description: "General AfuChat notifications",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00BCD4",
      ...base,
    });

    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      description: "Chat messages from your contacts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250],
      lightColor: "#00BCD4",
      ...base,
    });

    await Notifications.setNotificationChannelAsync("social", {
      name: "Social",
      description: "Likes, follows, replies and mentions",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#007AFF",
      ...base,
    });

    await Notifications.setNotificationChannelAsync("marketplace", {
      name: "Marketplace & Payments",
      description: "Orders, escrow releases, disputes and payments",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#34C759",
      ...base,
    });

    await Notifications.setNotificationChannelAsync("system", {
      name: "System & Account",
      description: "Account updates, verifications and admin messages",
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: false,
      ...base,
    });

    // ── Incoming calls — max priority, bypass DnD ──────────────────────
    await Notifications.setNotificationChannelAsync("calls", {
      name: "Incoming Calls",
      description: "Voice and video call alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: "#34C759",
      bypassDnd: true,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: "default",
    });
  } catch (e) {
    console.warn("[PushNotif] Channel setup failed:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === "web" || !Notifications || !Device) return null;
  try {
    if (!Device.isDevice) return null;

    await setupNotificationChannels();
    await setupNotificationCategories();

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

    if (finalStatus !== "granted") return null;

    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || EAS_PROJECT_ID;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Primary: save via edge function (service role key)
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
        if (res.ok) savedViaEdge = true;
        else console.warn("[PushNotif] Edge function token save failed:", await res.text());
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
      if (dbError) console.warn("[PushNotif] Fallback DB save failed:", dbError.message);
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
  await supabase.from("profiles").update({ expo_push_token: null }).eq("id", userId);
}

// ─────────────────────────────────────────────────────────────────────
// Linked-account session registry
// Call registerSwitchAccount + setCurrentUserId from AuthContext on mount
// so notification taps can switch to the correct linked account first.
// ─────────────────────────────────────────────────────────────────────

let _switchAccount: ((userId: string) => Promise<{ success: boolean; error?: string }>) | null = null;
let _currentUserId: string | null = null;

export function registerSwitchAccount(
  fn: (userId: string) => Promise<{ success: boolean; error?: string }>
) {
  _switchAccount = fn;
}

export function setCurrentUserId(id: string | null) {
  _currentUserId = id;
}

// ─────────────────────────────────────────────────────────────────────
// Notification response routing (tap on notification body)
// ─────────────────────────────────────────────────────────────────────

async function routeNotificationResponse(response: any) {
  const id = response.notification.request.identifier;
  if (alreadyHandled(id)) return;

  const data = (response.notification.request.content.data || {}) as Record<string, string>;

  // If this notification was sent to a linked account that is not currently
  // active, switch to it before navigating so the right data loads.
  if (
    data.recipientUserId &&
    data.recipientUserId !== _currentUserId &&
    _switchAccount
  ) {
    try {
      await _switchAccount(data.recipientUserId);
      // Brief pause for React state + navigation stack to settle.
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
    } catch {}
  }

  // Explicit view / navigation actions from action buttons
  if (response.actionIdentifier === "view_post" && data.postId) {
    router.push(`/p/${data.postId}` as any);
    return;
  }
  if (response.actionIdentifier === "view_profile" && data.actorId) {
    router.push(`/contact/${data.actorId}` as any);
    return;
  }
  if (response.actionIdentifier === "view_order") {
    if (data.orderId) router.push(`/shop/order/${data.orderId}` as any);
    else router.push("/shop/my-orders" as any);
    return;
  }
  if (response.actionIdentifier === "accept_call" && data.callId) {
    router.push(`/call/${data.callId}` as any);
    return;
  }

  // Default tap (no action button) — deep link or type-based routing
  if (data?.url) { router.push(data.url as any); return; }

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
      if (data.actorId) router.push(`/contact/${data.actorId}` as any);
      else router.push("/notifications" as any);
      break;
    case "like":
    case "reply":
    case "mention":
      if (data.postId) router.push(`/p/${data.postId}` as any);
      else router.push("/notifications" as any);
      break;
    case "gift":
      router.push("/notifications" as any);
      break;
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Notification listeners
// ─────────────────────────────────────────────────────────────────────

let _listenersActive = false;

export function setupNotificationListeners() {
  if (Platform.OS === "web" || !Notifications) return () => {};
  if (_listenersActive) return () => {};
  _listenersActive = true;

  // Drain cold-start response (app launched by tapping notification)
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      const { actionIdentifier, userText } = response as any;
      const data = (response.notification.request.content.data || {}) as Record<string, string>;
      handleNotificationAction(actionIdentifier, userText, data).then(() => {
        routeNotificationResponse(response);
      });
    }
  }).catch(() => {});

  // OS plays the channel sound for push notifications automatically.
  // In-app sound is handled per-screen (e.g. the active open chat).
  const receivedSubscription = Notifications.addNotificationReceivedListener(() => {});

  // Handle action button taps AND notification taps
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    async (response) => {
      const { actionIdentifier, userText } = response as any;
      const data = (response.notification.request.content.data || {}) as Record<string, string>;

      // Run action (reply, like, follow_back, etc.) — safe in background
      await handleNotificationAction(actionIdentifier, userText, data);

      // Then route if needed (navigation actions / default tap)
      const DEFAULT = Notifications?.DEFAULT_ACTION_IDENTIFIER ?? "com.apple.UNNotificationDefaultActionIdentifier";
      const isNavAction = [
        DEFAULT,
        "view_post",
        "view_profile",
        "view_order",
        "accept_call",
      ].includes(actionIdentifier);

      if (isNavAction) {
        routeNotificationResponse(response);
      }
    }
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
    _listenersActive = false;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Direct push sender (client-side, for completeness)
// ─────────────────────────────────────────────────────────────────────

export async function sendPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  categoryIdentifier?: string;
}): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .eq("id", params.userId)
      .single();

    if (!profile?.expo_push_token) return;

    const soundToken = await getPushSoundToken();

    const type = params.data?.type;
    const channelId =
      type === "message"  ? "messages"
      : type === "call"   ? "calls"
      : type === "follow" ? "social"
      : type === "like"   ? "social"
      : type === "reply"  ? "social"
      : type === "mention"? "social"
      : type === "order"  ? "marketplace"
      : type === "escrow" ? "marketplace"
      : type === "payment"? "marketplace"
      : "default";

    const payload: Record<string, any> = {
      to: profile.expo_push_token,
      title: params.title,
      body: params.body,
      // Always embed the intended recipient so the tap handler can switch
      // to the correct linked account before navigating.
      data: { recipientUserId: params.userId, ...(params.data || {}) },
      badge: 1,
      priority: type === "call" ? "high" : "normal",
      channelId,
      ttl: type === "call" ? 30 : 604800,
      expiration: Math.floor(Date.now() / 1000) + (type === "call" ? 30 : 604800),
    };

    // Collapse duplicate notifications of the same conversation/thread on both
    // iOS (thread-id) and Android (collapse_key via collapseId).
    if (type === "message" && params.data?.chatId) {
      payload.collapseId = `chat_${params.data.chatId}`;
      payload["thread-id"] = params.data.chatId;
    }
    if (type === "call") {
      payload.collapseId = `call_${params.data?.callId || params.userId}`;
    }

    if (soundToken) payload.sound = soundToken;
    if (params.categoryIdentifier) payload.categoryIdentifier = params.categoryIdentifier;

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(payload),
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
