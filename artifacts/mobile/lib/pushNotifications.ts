import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase } from "@/lib/supabase";

type NotificationsModule = typeof import("expo-notifications");
type PushResponse = {
  actionIdentifier: string;
  userText?: string;
  notification?: { request?: { identifier?: string; content?: { data?: Record<string, unknown> } } };
  data?: Record<string, unknown>;
};

export const PUSH_ACTION_REPLY = "reply";
export const PUSH_ACTION_MUTE = "mute";
export const PUSH_ACTION_MARK_READ = "mark_read";
export const PUSH_ACTION_OPEN = "open";
export const PUSH_ACTION_ACCEPT_CALL = "accept_call";
export const PUSH_ACTION_DECLINE_CALL = "decline_call";
export const PUSH_ACTION_DEFAULT = "expo.modules.notifications.actions.DEFAULT";
export const PUSH_CATEGORY_MESSAGE = "message";
export const PUSH_CATEGORY_CALL = "call";
export const PUSH_CATEGORY_SOCIAL = "social";
export const PUSH_CATEGORY_COMMERCE = "commerce";
export const PUSH_BACKGROUND_TASK = "AFUCHAT_NOTIFICATION_ACTION_TASK";

// Android channel sound settings are immutable after a channel is created.
// Versioned IDs let us correct an old channel without inheriting its stored
// ringtone-style sound setting.
export const PUSH_ANDROID_CHANNELS = {
  messages: {
    id: "messages_notifications_v1",
    name: "Message notifications",
    importance: "MAX",
  },
  calls: {
    id: "calls_notifications_v1",
    name: "Call notifications",
    importance: "MAX",
  },
  social: {
    id: "social_notifications_v1",
    name: "Social activity",
    importance: "DEFAULT",
  },
  commerce: {
    id: "commerce_notifications_v1",
    name: "Payments and orders",
    importance: "DEFAULT",
  },
} as const;

export const PUSH_ANDROID_CHANNEL_ID = PUSH_ANDROID_CHANNELS.messages.id;

let moduleCache: NotificationsModule | null | undefined;
let backgroundTaskRegistration: Promise<void> | null = null;
function getNotifications(): NotificationsModule | null {
  if (moduleCache !== undefined) return moduleCache;
  if (Platform.OS === "web") return (moduleCache = null);
  try {
    moduleCache = require("expo-notifications") as NotificationsModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

function getNotificationData(response: PushResponse): Record<string, unknown> {
  const contentData = response.notification?.request?.content?.data ?? {};
  const taskData = response.data ?? {};
  let serializedTaskData: Record<string, unknown> = {};
  const dataString = typeof taskData.dataString === "string" ? taskData.dataString : "";
  if (dataString) {
    try {
      const parsed = JSON.parse(dataString);
      if (parsed && typeof parsed === "object") serializedTaskData = parsed;
    } catch {}
  }
  return { ...serializedTaskData, ...taskData, ...contentData };
}

function getTarget(response: PushResponse) {
  const data = getNotificationData(response);
  const stringValue = (value: unknown) =>
    typeof value === "string" && value.length > 0 ? value : null;
  return {
    categoryId: stringValue(data.categoryId ?? data.category_id),
    chatId: stringValue(data.chatId ?? data.chat_id),
    messageId: stringValue(data.messageId ?? data.message_id),
    notificationId: stringValue(data.notificationId ?? data.notification_id),
    route: stringValue(data.route),
    entityId: stringValue(data.entityId ?? data.entity_id),
    callId: stringValue(data.callId ?? data.call_id),
    callerId: stringValue(data.callerId ?? data.caller_id),
    callerName: stringValue(data.callerName ?? data.caller_name),
    callerAvatar: stringValue(data.callerAvatar ?? data.caller_avatar),
  };
}

async function markRead(response: PushResponse, userId: string) {
  const { chatId, messageId } = getTarget(response);
  if (!chatId && !messageId) return;
  const now = new Date().toISOString();
  if (messageId) {
    await supabase.from("message_status").upsert(
      { message_id: messageId, user_id: userId, delivered_at: now, read_at: now },
      { onConflict: "message_id,user_id" },
    );
    return;
  }
  const { data } = await supabase.from("messages").select("id").eq("chat_id", chatId).neq("sender_id", userId).limit(200);
  if (data?.length) {
    await supabase.from("message_status").upsert(
      data.map((message) => ({ message_id: message.id, user_id: userId, delivered_at: now, read_at: now })),
      { onConflict: "message_id,user_id" },
    );
  }
}

async function markNotificationRead(response: PushResponse, userId: string) {
  const { notificationId } = getTarget(response);
  if (!notificationId) return;
  await supabase
    .from("notification_events")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", userId);
}

async function sendSuggestedReply(response: PushResponse, userId: string, text: string) {
  const { chatId, messageId } = getTarget(response);
  if (!chatId) return;
  await supabase.from("messages").insert({
    chat_id: chatId,
    sender_id: userId,
    encrypted_content: text,
    ...(messageId ? { reply_to_message_id: messageId } : {}),
  });
  await markRead(response, userId);
}

async function muteChat(response: PushResponse, userId: string) {
  const { chatId } = getTarget(response);
  if (!chatId) return;
  const mutedUntil = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  await supabase.from("chat_mutes").upsert(
    {
      user_id: userId,
      chat_id: chatId,
      muted_until: mutedUntil,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,chat_id" },
  );
}

async function handleCallAction(
  response: PushResponse,
  userId: string,
  userName: string,
  userAvatar: string | null,
) {
  const { callId, callerId, callerName, callerAvatar, chatId } = getTarget(response);
  if (!callId || !callerId) return;
  const { handleCallNotificationAction } = await import("@/lib/callEngine");
  await handleCallNotificationAction(
    response.actionIdentifier as "accept_call" | "decline_call",
    {
      callId,
      callerId,
      callerName: callerName ?? "AfuChat user",
      callerAvatar: callerAvatar ?? null,
      chatId,
    },
    { myId: userId, myName: userName || "AfuChat user", myAvatar: userAvatar },
  );
}

export async function handleNotificationResponse(
  response: PushResponse,
  userId: string,
  userName = "AfuChat user",
  userAvatar: string | null = null,
) {
  if (response.actionIdentifier === PUSH_ACTION_MARK_READ) {
    const { categoryId } = getTarget(response);
    if (categoryId === PUSH_CATEGORY_MESSAGE) await markRead(response, userId);
    else await markNotificationRead(response, userId);
    return;
  }
  if (response.actionIdentifier === PUSH_ACTION_REPLY) {
    const text = response.userText?.trim();
    if (text) await sendSuggestedReply(response, userId, text);
    return;
  }
  if (response.actionIdentifier === PUSH_ACTION_MUTE) {
    await muteChat(response, userId);
    return;
  }
  if (
    response.actionIdentifier === PUSH_ACTION_ACCEPT_CALL ||
    response.actionIdentifier === PUSH_ACTION_DECLINE_CALL
  ) {
    await handleCallAction(response, userId, userName, userAvatar);
  }
}

function defineBackgroundTask() {
  if (Platform.OS === "web") return;
  try {
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    TaskManager.defineTask(PUSH_BACKGROUND_TASK, async ({ data, error }: any) => {
      if (error || !data || !data.actionIdentifier) return;
      if (
        data.actionIdentifier !== PUSH_ACTION_REPLY &&
        data.actionIdentifier !== PUSH_ACTION_MUTE &&
        data.actionIdentifier !== PUSH_ACTION_MARK_READ &&
        data.actionIdentifier !== PUSH_ACTION_DECLINE_CALL
      ) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (userId) await handleNotificationResponse(data as PushResponse, userId);
    });

    // Defining a task is not enough: Expo only delivers background action
    // responses to tasks that have also been registered with the notifications
    // module. Keep this registration idempotent because this module can be
    // imported by both the root layout and a notification manager.
    const notifications = getNotifications();
    if (notifications?.registerTaskAsync) {
      backgroundTaskRegistration = notifications.registerTaskAsync(PUSH_BACKGROUND_TASK)
        .then(() => undefined)
        .catch((error) => {
          if (__DEV__) console.warn("[push] background action task registration failed", error);
        });
    }
  } catch (error) {
    if (__DEV__) console.warn("[push] background action task unavailable", error);
  }
}
defineBackgroundTask();

export function configurePushNotifications() {
  const notifications = getNotifications();
  if (!notifications) return;
  // Retry registration if the native notifications module was not ready during
  // module evaluation (common during a cold start on Android).
  if (!backgroundTaskRegistration && notifications.registerTaskAsync) {
    backgroundTaskRegistration = notifications.registerTaskAsync(PUSH_BACKGROUND_TASK)
      .then(() => undefined)
      .catch((error) => {
        if (__DEV__) console.warn("[push] background action task registration failed", error);
      });
  }
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  const categories = [
    notifications.setNotificationCategoryAsync(PUSH_CATEGORY_MESSAGE, [
      { identifier: PUSH_ACTION_REPLY, buttonTitle: "Reply", textInput: { submitButtonTitle: "Send", placeholder: "Reply..." }, options: { opensAppToForeground: false } },
      { identifier: PUSH_ACTION_MUTE, buttonTitle: "Mute", options: { opensAppToForeground: false } },
      { identifier: PUSH_ACTION_MARK_READ, buttonTitle: "Mark as read", options: { opensAppToForeground: false } },
    ]),
    notifications.setNotificationCategoryAsync(PUSH_CATEGORY_CALL, [
      { identifier: PUSH_ACTION_ACCEPT_CALL, buttonTitle: "Answer", options: { opensAppToForeground: true } },
      { identifier: PUSH_ACTION_DECLINE_CALL, buttonTitle: "Decline", options: { opensAppToForeground: false, isDestructive: true } },
      { identifier: PUSH_ACTION_OPEN, buttonTitle: "Open", options: { opensAppToForeground: true } },
    ]),
    notifications.setNotificationCategoryAsync(PUSH_CATEGORY_SOCIAL, [
      { identifier: PUSH_ACTION_MARK_READ, buttonTitle: "Mark as read", options: { opensAppToForeground: false } },
      { identifier: PUSH_ACTION_OPEN, buttonTitle: "View", options: { opensAppToForeground: true } },
    ]),
    notifications.setNotificationCategoryAsync(PUSH_CATEGORY_COMMERCE, [
      { identifier: PUSH_ACTION_MARK_READ, buttonTitle: "Mark as read", options: { opensAppToForeground: false } },
      { identifier: PUSH_ACTION_OPEN, buttonTitle: "View", options: { opensAppToForeground: true } },
    ]),
  ];
  void Promise.all(categories).catch(() => {});
  if (Platform.OS === "android") {
    const importance = {
      MAX: notifications.AndroidImportance.MAX,
      DEFAULT: notifications.AndroidImportance.DEFAULT,
    } as const;
    for (const channel of Object.values(PUSH_ANDROID_CHANNELS)) {
      notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: importance[channel.importance],
        vibrationPattern: [0, 250, 250, 250],
        // "default" resolves to the device notification sound, not its ringtone.
        sound: "default",
      }).catch(() => {});
    }
  }
}

export async function registerPushToken(): Promise<string | null> {
  const notifications = getNotifications();
  if (!notifications || Platform.OS === "web" || !Device.isDevice) return null;
  configurePushNotifications();
  const current = await notifications.getPermissionsAsync();
  const permission = (current as any).status === "granted" ? current : await notifications.requestPermissionsAsync();
  if ((permission as any).status !== "granted") return null;
  const token = await notifications.getDevicePushTokenAsync();
  if (token.type !== Platform.OS || typeof token.data !== "string" || token.data.length < 20 || /^(Expo|Exponent)PushToken\[/.test(token.data)) {
    throw new Error("The native build did not return a direct FCM token.");
  }
  const { error } = await supabase.functions.invoke("register-push-token", {
    body: { token: token.data, platform: Platform.OS, provider: "fcm", appVersion: Constants.expoConfig?.version ?? "" },
  });
  if (error) throw error;
  return token.data;
}

export function addNotificationResponseListener(listener: (response: PushResponse) => void) {
  return getNotifications()?.addNotificationResponseReceivedListener(listener as any) ?? null;
}

export async function getLastNotificationResponse() {
  const response = await getNotifications()?.getLastNotificationResponseAsync();
  if (!response) return response as null | undefined;
  return response as PushResponse;
}

export function clearLastNotificationResponse() {
  getNotifications()?.clearLastNotificationResponse?.();
}

export function getNotificationTarget(response: PushResponse) {
  return getTarget(response);
}

export type NotifyChatRecipientsParams = {
  recipientIds: string[];
  senderName: string;
  senderAvatarUrl?: string | null;
  body: string;
  chatId: string;
  messageId: string;
  senderId?: string;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
};

export async function notifyChatRecipients(params: NotifyChatRecipientsParams) {
  const recipientUserIds = [...new Set(params.recipientIds)].filter((id) => id && id !== params.senderId);
  if (!recipientUserIds.length) return;
  const { error } = await supabase.functions.invoke("send-push-notification", {
    body: {
      recipientUserIds,
      senderId: params.senderId,
      senderName: params.senderName,
      senderAvatarUrl: params.senderAvatarUrl ?? null,
      body: params.body,
      chatId: params.chatId,
      messageId: params.messageId,
      attachmentUrl: params.attachmentUrl ?? null,
      attachmentType: params.attachmentType ?? null,
      categoryId: PUSH_CATEGORY_MESSAGE,
      data: { chatId: params.chatId, messageId: params.messageId, categoryId: PUSH_CATEGORY_MESSAGE },
    },
  });
  if (error && __DEV__) console.warn("[push] delivery request failed", error.message);
}

export type NotifyCallRecipientParams = {
  recipientId: string;
  senderId: string;
  callerName: string;
  callerAvatar?: string | null;
  callId: string;
  chatId?: string | null;
};

export async function notifyCallRecipient(params: NotifyCallRecipientParams) {
  if (!params.recipientId || !params.senderId || params.recipientId === params.senderId) return;
  const { error } = await supabase.functions.invoke("send-push-notification", {
    body: {
      recipientUserIds: [params.recipientId],
      senderId: params.senderId,
      senderName: params.callerName,
      senderAvatarUrl: params.callerAvatar ?? null,
      title: "Incoming voice call",
      body: `${params.callerName || "Someone"} is calling you`,
      callId: params.callId,
      chatId: params.chatId ?? null,
      categoryId: PUSH_CATEGORY_CALL,
      channelId: PUSH_ANDROID_CHANNELS.calls.id,
      data: {
        callId: params.callId,
        callerId: params.senderId,
        callerName: params.callerName,
        callerAvatar: params.callerAvatar ?? "",
        chatId: params.chatId ?? "",
        categoryId: PUSH_CATEGORY_CALL,
      },
    },
  });
  if (error && __DEV__) console.warn("[push] call delivery request failed", error.message);
}