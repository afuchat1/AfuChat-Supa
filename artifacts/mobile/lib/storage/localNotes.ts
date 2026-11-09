import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  deleteLocalConversation,
  getLocalConversation,
  saveConversations,
  updateConversationFlags,
  updateConversationLastMessage,
} from "./localConversations";

const ENABLED_PREFIX = "my_notes_enabled:";
const DATA_PREFIX = "my_notes_data:";
const MESSAGES_PREFIX = "my_notes_messages:";
export const LOCAL_NOTES_NAME = "My Notes";

export type LocalNotesConversation = {
  id: string;
  name: string;
  other_id: string;
  last_message: string;
  last_message_at: string;
  last_message_is_mine: boolean;
  last_message_status: "sent" | "delivered" | "read";
  is_pinned: boolean;
  is_archived: boolean;
};

export type LocalNotesMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string;
  sent_at: string;
  reply_to_message_id: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  status: "sent" | "delivered" | "read" | "sending";
};

export function getLocalNotesId(userId: string): string {
  return `local_notes:${userId}`;
}

export function isLocalNotesId(id: string | undefined | null): boolean {
  return !!id && id.startsWith("local_notes:");
}

async function getEnabledKey(userId: string): Promise<string | null> {
  const enabled = await AsyncStorage.getItem(`${ENABLED_PREFIX}${userId}`).catch(() => null);
  return enabled === "1" ? getLocalNotesId(userId) : null;
}

export async function createLocalNotesConversation(userId: string): Promise<string> {
  const id = getLocalNotesId(userId);
  const existing = await readStoredConversation(userId);
  const conversation: LocalNotesConversation = existing ?? {
    id,
    name: LOCAL_NOTES_NAME,
    other_id: userId,
    last_message: "",
    last_message_at: "",
    last_message_is_mine: true,
    last_message_status: "sent",
    is_pinned: false,
    is_archived: false,
  };
  await AsyncStorage.multiSet([
    [`${ENABLED_PREFIX}${userId}`, "1"],
    [`${DATA_PREFIX}${userId}`, JSON.stringify(conversation)],
  ]).catch(() => {});
  await saveConversations([{
    id,
    name: conversation.name,
    is_group: false,
    is_channel: false,
    other_id: userId,
    other_display_name: LOCAL_NOTES_NAME,
    other_avatar: null,
    last_message: conversation.last_message,
    last_message_at: conversation.last_message_at,
    last_message_is_mine: conversation.last_message_is_mine,
    last_message_status: conversation.last_message_status,
    is_pinned: conversation.is_pinned,
    is_archived: conversation.is_archived,
    avatar_url: null,
    unread_count: 0,
    is_verified: false,
    is_organization_verified: false,
    other_last_seen: null,
    other_show_online: false,
  }]);
  return id;
}

export async function getLocalNotesConversation(userId: string) {
  const id = await getEnabledKey(userId);
  if (!id) return null;
  const stored = await readStoredConversation(userId);
  if (stored) return stored;
  return getLocalConversation(id);
}

export async function removeLocalNotesConversation(userId: string): Promise<void> {
  const id = getLocalNotesId(userId);
  await Promise.all([
    deleteLocalConversation(id),
    AsyncStorage.multiRemove([
      `${ENABLED_PREFIX}${userId}`,
      `${DATA_PREFIX}${userId}`,
      `${MESSAGES_PREFIX}${userId}`,
      `chat_draft_${id}`,
    ]).catch(() => {}),
  ]);
}

export async function updateLocalNotesFlags(
  userId: string,
  flags: { is_pinned?: boolean; is_archived?: boolean },
): Promise<void> {
  const current = await getLocalNotesConversation(userId);
  if (!current) return;
  const next = { ...current, ...flags };
  await AsyncStorage.setItem(`${DATA_PREFIX}${userId}`, JSON.stringify(next)).catch(() => {});
  await updateConversationFlags(getLocalNotesId(userId), flags);
}

export async function saveLocalNotesMessage(
  userId: string,
  message: Omit<LocalNotesMessage, "chat_id">,
): Promise<void> {
  const chatId = getLocalNotesId(userId);
  const key = `${MESSAGES_PREFIX}${userId}`;
  const current = await getLocalNotesMessages(userId);
  const next = [...current.filter((item) => item.id !== message.id), { ...message, chat_id: chatId }]
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  await AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  await updateLocalNotesLastMessage(userId, message.encrypted_content, message.sent_at);
}

export async function updateLocalNotesMessage(
  userId: string,
  messageId: string,
  encryptedContent: string,
): Promise<void> {
  const messages = await getLocalNotesMessages(userId);
  const next = messages.map((message) =>
    message.id === messageId
      ? { ...message, encrypted_content: encryptedContent }
      : message,
  );
  if (next.length === messages.length) {
    await AsyncStorage.setItem(`${MESSAGES_PREFIX}${userId}`, JSON.stringify(next)).catch(() => {});
  }

  const sorted = [...next].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const latest = sorted[sorted.length - 1];
  if (latest) {
    await updateLocalNotesLastMessage(userId, latest.encrypted_content, latest.sent_at);
  } else {
    await clearLocalNotesMessages(userId);
  }
}

export async function deleteLocalNotesMessage(
  userId: string,
  messageId: string,
): Promise<void> {
  const messages = await getLocalNotesMessages(userId);
  const next = messages.filter((message) => message.id !== messageId);
  await AsyncStorage.setItem(`${MESSAGES_PREFIX}${userId}`, JSON.stringify(next)).catch(() => {});

  const sorted = [...next].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const latest = sorted[sorted.length - 1];
  if (latest) {
    await updateLocalNotesLastMessage(userId, latest.encrypted_content, latest.sent_at);
  } else {
    await clearLocalNotesMessages(userId);
  }
}

export async function getLocalNotesMessages(userId: string): Promise<LocalNotesMessage[]> {
  const raw = await AsyncStorage.getItem(`${MESSAGES_PREFIX}${userId}`).catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function clearLocalNotesMessages(userId: string): Promise<void> {
  await AsyncStorage.removeItem(`${MESSAGES_PREFIX}${userId}`).catch(() => {});
  const current = await getLocalNotesConversation(userId);
  if (!current) return;
  const next = {
    ...current,
    last_message: "",
    last_message_at: "",
    last_message_is_mine: true,
    last_message_status: "sent" as const,
  };
  await AsyncStorage.setItem(`${DATA_PREFIX}${userId}`, JSON.stringify(next)).catch(() => {});
}

export async function updateLocalNotesLastMessage(
  userId: string,
  lastMessage: string,
  sentAt: string,
): Promise<void> {
  const current = await getLocalNotesConversation(userId);
  if (!current) return;
  const next = {
    ...current,
    last_message: lastMessage,
    last_message_at: sentAt,
    last_message_is_mine: true,
    last_message_status: "sent" as const,
  };
  await AsyncStorage.setItem(`${DATA_PREFIX}${userId}`, JSON.stringify(next)).catch(() => {});
  await updateConversationLastMessage(getLocalNotesId(userId), lastMessage, sentAt, true);
}

async function readStoredConversation(userId: string): Promise<LocalNotesConversation | null> {
  const raw = await AsyncStorage.getItem(`${DATA_PREFIX}${userId}`).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.id === getLocalNotesId(userId) ? parsed : null;
  } catch {
    return null;
  }
}