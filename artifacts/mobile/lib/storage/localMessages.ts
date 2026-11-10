// ─── Permanent Message Store ────────────────────────────────────────────────────
// Messages are persisted locally and merged with bounded server backfills.
// Chat opening backfills the latest server page; older locally cached history
// remains available for paging without repeatedly downloading the full thread.
//
// RULES:
//   • INSERT OR IGNORE  — preserve content unless the server confirms an edit
//   • No TTL, no auto-trim — messages live until the user deletes the conversation
//   • Keep delivery/read receipt timestamps beside the message for offline info

import { getDB } from "./db";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isClientMessageId } from "./messageIds";
export { createLocalMessageId, isClientMessageId } from "./messageIds";

export type LocalMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  sender_handle: string | null;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  reply_to_id: string | null;
  status: string;
  sent_at: string;
  edited_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  is_pending: boolean;
  synced: boolean;
};

export function mapToLocal(msg: any, conversationId: string): LocalMessage {
  const rawSender = msg.sender ?? msg.profiles ?? null;
  const sender = Array.isArray(rawSender) ? rawSender[0] : rawSender;
  const senderDisplayName =
    (typeof sender?.display_name === "string" ? sender.display_name.trim() : "") ||
    (typeof msg.sender_display_name === "string" ? msg.sender_display_name.trim() : "") ||
    null;
  const senderAvatarUrl =
    (typeof sender?.avatar_url === "string" && sender.avatar_url.trim() ? sender.avatar_url : null) ??
    msg.sender_avatar_url ??
    null;
  const senderHandle =
    (typeof sender?.handle === "string" ? sender.handle.trim() : "") ||
    (typeof msg.sender_handle === "string" ? msg.sender_handle.trim() : "") ||
    null;
  const isPending = msg._pending ?? msg.is_pending ?? false;
  return {
    id: msg.id,
    conversation_id: conversationId,
    sender_id: msg.sender_id,
    sender_display_name: senderDisplayName,
    sender_avatar_url: senderAvatarUrl,
    sender_handle: senderHandle,
    content: msg.encrypted_content ?? msg.content ?? null,
    attachment_url: msg.attachment_url ?? null,
    attachment_type: msg.attachment_type ?? null,
    reply_to_id: msg.reply_to_message_id ?? msg.reply_to_id ?? null,
    status: msg.status ?? "sent",
    sent_at: msg.sent_at ?? msg.created_at ?? new Date().toISOString(),
    edited_at: msg.edited_at ?? null,
    delivered_at: msg.delivered_at ?? null,
    read_at: msg.read_at ?? null,
    is_pending: !!isPending,
    synced: msg.synced ?? !isPending,
  };
}

// The native implementation uses SQLite. Expo's web adapter intentionally has
// no SQLite, so persist web conversations through the existing AsyncStorage
// cache instead of returning only queued/unsent messages on every open.
const webMessageWriteQueues = new Map<string, Promise<void>>();
const WEB_MESSAGES_PREFIX = "offline_messages_";

function mergeLocalMessage(previous: LocalMessage | undefined, next: LocalMessage): LocalMessage {
  if (!previous) return next;
  const nextEditIsNewer = !!next.edited_at &&
    (!previous.edited_at || next.edited_at > previous.edited_at);
  const rank: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3 };
  const status = (rank[next.status] ?? 1) > (rank[previous.status] ?? 1)
    ? next.status
    : previous.status;
  return {
    ...previous,
    content: nextEditIsNewer ? next.content : previous.content ?? next.content,
    attachment_url: nextEditIsNewer ? next.attachment_url : previous.attachment_url ?? next.attachment_url,
    attachment_type: nextEditIsNewer ? next.attachment_type : previous.attachment_type ?? next.attachment_type,
    reply_to_id: previous.reply_to_id ?? next.reply_to_id,
    status,
    sent_at: previous.sent_at || next.sent_at,
    edited_at: nextEditIsNewer ? next.edited_at : previous.edited_at ?? next.edited_at,
    delivered_at: latestTime(previous.delivered_at, next.delivered_at),
    read_at: latestTime(previous.read_at, next.read_at),
    sender_display_name: next.sender_display_name || previous.sender_display_name,
    sender_avatar_url: next.sender_avatar_url || previous.sender_avatar_url,
    sender_handle: next.sender_handle || previous.sender_handle,
    is_pending: previous.is_pending && next.is_pending,
    synced: previous.synced || next.synced,
  };
}

function latestTime(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

const WARM_MESSAGE_LIMIT = 200;
const WARM_CONVERSATION_LIMIT = 8;
const warmMessages = new Map<string, LocalMessage[]>();
const warmMessageReads = new Set<string>();

function rememberWarmMessages(
  conversationId: string,
  messages: LocalMessage[],
  markReadComplete = false,
): void {
  if (!conversationId) return;
  const previous = warmMessages.get(conversationId) ?? [];
  const byId = new Map(previous.map((message) => [message.id, message]));
  for (const message of messages) {
    byId.set(message.id, mergeLocalMessage(byId.get(message.id), message));
  }
  const next = [...byId.values()]
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
    .slice(-WARM_MESSAGE_LIMIT);
  warmMessages.delete(conversationId);
  warmMessages.set(conversationId, next);
  if (markReadComplete) warmMessageReads.add(conversationId);
  while (warmMessages.size > WARM_CONVERSATION_LIMIT) {
    const oldestId = warmMessages.keys().next().value;
    if (!oldestId) break;
    warmMessages.delete(oldestId);
    warmMessageReads.delete(oldestId);
  }
}

function forgetWarmMessage(conversationId: string, messageId: string): void {
  const current = warmMessages.get(conversationId);
  if (!current?.some((message) => message.id === messageId)) return;
  warmMessages.delete(conversationId);
  warmMessages.set(
    conversationId,
    current.filter((message) => message.id !== messageId),
  );
}

/** Synchronous hot cache for instant reopening during the current app session. */
export function getWarmLocalMessages(conversationId: string, limit = WARM_MESSAGE_LIMIT): LocalMessage[] | null {
  if (!warmMessageReads.has(conversationId)) return null;
  return (warmMessages.get(conversationId) ?? []).slice(-limit);
}

async function readWebMessages(conversationId: string): Promise<LocalMessage[]> {
  const { getCachedMessages } = await import("../offlineStore");
  const raw = await getCachedMessages(conversationId);
  const byId = new Map<string, LocalMessage>();
  for (const item of raw) {
    if (!item?.id) continue;
    const local = mapToLocal(item, conversationId);
    byId.set(local.id, mergeLocalMessage(byId.get(local.id), local));
  }
  return [...byId.values()].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
}

async function updateWebMessages(
  conversationId: string,
  update: (messages: LocalMessage[]) => LocalMessage[],
): Promise<void> {
  const previous = webMessageWriteQueues.get(conversationId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const { cacheMessages } = await import("../offlineStore");
    const current = await readWebMessages(conversationId);
    const updated = update(current);
    rememberWarmMessages(conversationId, updated);
    await cacheMessages(conversationId, updated);
  });
  webMessageWriteQueues.set(conversationId, next);
  try {
    await next;
  } finally {
    if (webMessageWriteQueues.get(conversationId) === next) {
      webMessageWriteQueues.delete(conversationId);
    }
  }
}

async function waitForWebMessageWrites(conversationId: string): Promise<void> {
  await webMessageWriteQueues.get(conversationId)?.catch(() => {});
}

async function getWebMessageChatIds(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  return keys
    .filter((key) => key.startsWith(WEB_MESSAGES_PREFIX))
    .map((key) => key.slice(WEB_MESSAGES_PREFIX.length));
}

async function findWebMessageChatIds(messageId: string): Promise<string[]> {
  const chatIds = await getWebMessageChatIds();
  const matches: string[] = [];
  for (const chatId of chatIds) {
    await waitForWebMessageWrites(chatId);
    if ((await readWebMessages(chatId)).some((message) => message.id === messageId)) {
      matches.push(chatId);
    }
  }
  return matches;
}

// ─── Reads ──────────────────────────────────────────────────────────────────────

/** Load messages from device — newest N, in chronological order for display. */
export async function getLocalMessages(
  conversationId: string,
  limit = 100,
  beforeSentAt?: string,
  afterSentAt?: string,
): Promise<LocalMessage[]> {
  try {
    if (Platform.OS === "web") {
      await waitForWebMessageWrites(conversationId);
      const { getPendingMessages } = await import("../offlineStore");
      const queued = await getPendingMessages();
      const localById = new Map((await readWebMessages(conversationId)).map((msg) => [msg.id, msg]));
      queued
        .filter((msg) => msg.chat_id === conversationId)
        .forEach((msg) => {
          const pending = mapToLocal({ ...msg, _pending: true, status: "sending" }, conversationId);
          localById.set(pending.id, mergeLocalMessage(localById.get(pending.id), pending));
        });
      const result = [...localById.values()]
        .filter((msg) => !beforeSentAt || msg.sent_at < beforeSentAt)
        .filter((msg) => !afterSentAt || msg.sent_at > afterSentAt)
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
        .slice(-limit);
      rememberWarmMessages(conversationId, result, true);
      return result;
    }

    const db = await getDB();
    const conditions = ["conversation_id = ?"];
    const params: (string | number)[] = [conversationId];
    if (beforeSentAt) {
      conditions.push("sent_at < ?");
      params.push(beforeSentAt);
    }
    if (afterSentAt) {
      conditions.push("sent_at > ?");
      params.push(afterSentAt);
    }
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM messages
       WHERE ${conditions.join(" AND ")}
       ORDER BY sent_at DESC LIMIT ?`,
      [...params, limit],
    );
    rows.reverse();
    const messages = rows.map(rowToMsg) as LocalMessage[];
    rememberWarmMessages(conversationId, messages, true);
    return messages;
  } catch {
    return [];
  }
}

/**
 * Returns the sent_at of the newest confirmed message stored locally.
 * Used to seed history pagination and distinguish an empty local cache.
 */
export async function getNewestMessageDate(conversationId: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      await waitForWebMessageWrites(conversationId);
      const messages = await readWebMessages(conversationId);
      return messages
        .filter((message) => !message.is_pending)
        .reduce<string | null>((newest, message) =>
          !newest || message.sent_at > newest ? message.sent_at : newest, null);
    }
    const db = await getDB();
    const row = await db.getFirstAsync<{ sent_at: string }>(
      "SELECT sent_at FROM messages WHERE conversation_id = ? AND is_pending = 0 ORDER BY sent_at DESC LIMIT 1",
      [conversationId],
    );
    return row?.sent_at ?? null;
  } catch {
    return null;
  }
}

/** Return edit versions for recent IDs so server reconciliation stays incremental. */
export async function getLocalMessageEditTimestamps(
  conversationId: string,
  messageIds: string[],
): Promise<Map<string, string | null>> {
  if (!conversationId || messageIds.length === 0) return new Map();
  try {
    if (Platform.OS === "web") {
      await waitForWebMessageWrites(conversationId);
      const cached = await readWebMessages(conversationId);
      const requested = new Set(messageIds);
      const versions = new Map<string, string | null>();
      cached.forEach((message) => {
        if (requested.has(message.id)) versions.set(message.id, message.edited_at);
      });
      return versions;
    }

    const db = await getDB();
    const found = new Map<string, string | null>();
    // Keep bind parameter counts comfortably below SQLite's platform limits.
    for (let offset = 0; offset < messageIds.length; offset += 80) {
      const chunk = messageIds.slice(offset, offset + 80);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = await db.getAllAsync<{ id: string; edited_at: string | null }>(
        `SELECT id, edited_at FROM messages
         WHERE conversation_id = ? AND id IN (${placeholders})`,
        [conversationId, ...chunk],
      );
      rows.forEach((row) => found.set(row.id, row.edited_at ?? null));
    }
    return found;
  } catch {
    return new Map();
  }
}

export async function getOldestMessageDate(conversationId: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      await waitForWebMessageWrites(conversationId);
      const messages = (await readWebMessages(conversationId)).filter((message) => !message.is_pending);
      return messages.reduce<string | null>((oldest, message) =>
        !oldest || message.sent_at < oldest ? message.sent_at : oldest, null);
    }
    const db = await getDB();
    const row = await db.getFirstAsync<{ sent_at: string }>(
      "SELECT sent_at FROM messages WHERE conversation_id = ? AND is_pending = 0 ORDER BY sent_at ASC LIMIT 1",
      [conversationId],
    );
    return row?.sent_at ?? null;
  } catch {
    return null;
  }
}

export async function getLocalMessageCount(conversationId: string): Promise<number> {
  try {
    if (Platform.OS === "web") {
      await waitForWebMessageWrites(conversationId);
      return (await readWebMessages(conversationId)).length;
    }
    const db = await getDB();
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?",
      [conversationId],
    );
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

// ─── Writes ─────────────────────────────────────────────────────────────────────

/**
 * Persist messages permanently. Uses INSERT OR IGNORE — already-stored messages
 * are never overwritten. An explicit newer edited_at may update message content;
 * status, receipts, and non-empty sender snapshots are merged safely.
 */
export async function saveMessages(conversationId: string, messages: any[]): Promise<void> {
  if (!messages.length) return;
  try {
    if (Platform.OS === "web") {
      await updateWebMessages(conversationId, (current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        for (const message of messages) {
          if (!message?.id) continue;
          const local = mapToLocal(message, conversationId);
          byId.set(local.id, mergeLocalMessage(byId.get(local.id), local));
        }
        return [...byId.values()].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      });
      return;
    }
    const db = await getDB();
    const now = Date.now();
    for (const msg of messages) {
      const local = mapToLocal(msg, conversationId);
      // INSERT OR IGNORE: if the row already exists, skip it entirely — no re-download
      await db.runAsync(
        `INSERT OR IGNORE INTO messages
         (id, conversation_id, sender_id, content, attachment_url, attachment_type,
          reply_to_id, status, sent_at, edited_at, delivered_at, read_at,
          is_pending, synced, stored_at,
          sender_display_name, sender_avatar_url, sender_handle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          local.id,
          local.conversation_id,
          local.sender_id,
          local.content,
          local.attachment_url,
          local.attachment_type,
          local.reply_to_id,
          local.status,
          local.sent_at,
          local.edited_at,
          local.delivered_at,
          local.read_at,
          local.is_pending ? 1 : 0,
          local.synced ? 1 : 0,
          now,
          local.sender_display_name,
          local.sender_avatar_url,
          local.sender_handle,
        ],
      );
      // Fill or refresh identity snapshots only with non-empty profile data.
      // This keeps sender names and avatars when later payloads omit profiles.
      if (
        msg.status ||
        msg.edited_at ||
        local.delivered_at ||
        local.read_at ||
        local.sender_display_name ||
        local.sender_avatar_url ||
        local.sender_handle
      ) {
        await db.runAsync(
          `UPDATE messages SET
             content = CASE
               WHEN ? IS NULL THEN content
               WHEN edited_at IS NOT NULL AND edited_at > ? THEN content
               ELSE ?
             END,
             status = CASE
               WHEN status = 'read' OR ? = 'read' THEN 'read'
               WHEN status = 'delivered' OR ? = 'delivered' THEN 'delivered'
               WHEN ? IS NOT NULL THEN ?
               ELSE status
             END,
             edited_at = CASE
               WHEN ? IS NULL THEN edited_at
               WHEN edited_at IS NULL OR edited_at < ? THEN ?
               ELSE edited_at
             END,
             delivered_at = CASE
               WHEN ? IS NULL THEN delivered_at
               WHEN delivered_at IS NULL OR delivered_at < ? THEN ?
               ELSE delivered_at
             END,
             read_at = CASE
               WHEN ? IS NULL THEN read_at
               WHEN read_at IS NULL OR read_at < ? THEN ?
               ELSE read_at
             END,
             sender_display_name = COALESCE(NULLIF(?, ''), sender_display_name),
             sender_avatar_url = COALESCE(?, sender_avatar_url),
             sender_handle = COALESCE(NULLIF(?, ''), sender_handle)
           WHERE id = ?`,
          [
             local.edited_at,
             local.edited_at,
             local.content,
            msg.status ?? null,
            msg.status ?? null,
            msg.status ?? null,
            msg.status ?? null,
             local.edited_at,
             local.edited_at,
             local.edited_at,
            local.delivered_at,
            local.delivered_at,
            local.delivered_at,
            local.read_at,
            local.read_at,
            local.read_at,
            local.sender_display_name,
            local.sender_avatar_url,
            local.sender_handle,
            local.id,
          ],
        );
      }
    }
    rememberWarmMessages(conversationId, messages.map((msg) => mapToLocal(msg, conversationId)));
  } catch {}
}

/** Save a locally composed message that hasn't been sent to the server yet. */
export async function savePendingMessage(msg: {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  sent_at: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  reply_to_id?: string | null;
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
  sender_handle?: string | null;
}): Promise<void> {
  const local = mapToLocal({
    ...msg,
    chat_id: msg.conversation_id,
    encrypted_content: msg.content,
    reply_to_message_id: msg.reply_to_id,
    _pending: true,
    status: "sending",
  }, msg.conversation_id);
  if (Platform.OS === "web") {
    await updateWebMessages(msg.conversation_id, (current) => {
      const byId = new Map(current.map((message) => [message.id, message]));
      byId.set(local.id, mergeLocalMessage(byId.get(local.id), local));
      return [...byId.values()].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    });
    return;
  }
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO messages
     (id, conversation_id, sender_id, content, attachment_url, attachment_type,
      reply_to_id, status, sent_at, edited_at, is_pending, synced, stored_at,
      sender_display_name, sender_avatar_url, sender_handle)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'sending', ?, NULL, 1, 0, ?, ?, ?, ?)`,
    [
      msg.id,
      msg.conversation_id,
      msg.sender_id,
      msg.content,
      msg.attachment_url ?? null,
      msg.attachment_type ?? null,
      msg.reply_to_id ?? null,
      msg.sent_at,
      Date.now(),
      msg.sender_display_name ?? null,
      msg.sender_avatar_url ?? null,
      msg.sender_handle ?? null,
    ],
  );
  rememberWarmMessages(msg.conversation_id, [local]);
}

export async function markMessageSynced(localId: string, serverId: string): Promise<void> {
  if (Platform.OS === "web") {
    const chatIds = await findWebMessageChatIds(localId);
    for (const chatId of chatIds) {
      await updateWebMessages(chatId, (messages) => {
        const pending = messages.find((message) => message.id === localId);
        if (!pending) return messages;
        const withoutPending = messages.filter((message) => message.id !== localId);
        const confirmed = {
          ...pending,
          id: serverId,
          is_pending: false,
          synced: true,
          status: "sent",
        };
        const existing = withoutPending.find((message) => message.id === serverId);
        return [
          ...withoutPending.filter((message) => message.id !== serverId),
          mergeLocalMessage(existing, confirmed),
        ].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      });
    }
    return;
  }
  const db = await getDB();
  await db.runAsync(
    "UPDATE messages SET id = ?, is_pending = 0, synced = 1, status = 'sent' WHERE id = ?",
    [serverId, localId],
  );
  for (const [conversationId, messages] of warmMessages) {
    const pending = messages.find((message) => message.id === localId);
    if (pending) {
      rememberWarmMessages(conversationId, [{
        ...pending,
        id: serverId,
        is_pending: false,
        synced: true,
        status: "sent",
      }]);
      break;
    }
  }
}

export async function saveMessageReceipts(
  messageId: string,
  receipts: { delivered_at?: string | null; read_at?: string | null },
): Promise<void> {
  if (!receipts.delivered_at && !receipts.read_at) return;
  try {
    if (Platform.OS === "web") {
      const chatIds = await findWebMessageChatIds(messageId);
      for (const chatId of chatIds) {
        await updateWebMessages(chatId, (messages) => messages.map((message) => {
          if (message.id !== messageId) return message;
          const deliveredAt = latestTime(message.delivered_at, receipts.delivered_at ?? null);
          const readAt = latestTime(message.read_at, receipts.read_at ?? null);
          return {
            ...message,
            delivered_at: deliveredAt,
            read_at: readAt,
            status: readAt ? "read" : deliveredAt && message.status !== "read" ? "delivered" : message.status,
          };
        }));
      }
      return;
    }
    const db = await getDB();
    const deliveredAt = receipts.delivered_at ?? null;
    const readAt = receipts.read_at ?? null;
    await db.runAsync(
      `UPDATE messages SET
         delivered_at = CASE
           WHEN ? IS NULL THEN delivered_at
           WHEN delivered_at IS NULL OR delivered_at < ? THEN ?
           ELSE delivered_at
         END,
         read_at = CASE
           WHEN ? IS NULL THEN read_at
           WHEN read_at IS NULL OR read_at < ? THEN ?
           ELSE read_at
         END,
         status = CASE
           WHEN read_at IS NOT NULL OR ? IS NOT NULL THEN 'read'
           WHEN delivered_at IS NOT NULL OR ? IS NOT NULL THEN
             CASE WHEN status = 'read' THEN status ELSE 'delivered' END
           ELSE status
         END
       WHERE id = ?`,
      [
        deliveredAt, deliveredAt, deliveredAt,
        readAt, readAt, readAt,
        readAt, deliveredAt, messageId,
      ],
    );
  } catch {}
}

export async function markMessageDelivered(
  messageId: string,
  deliveredAt = new Date().toISOString(),
): Promise<void> {
  await saveMessageReceipts(messageId, { delivered_at: deliveredAt });
}

export async function markMessageRead(
  messageId: string,
  readAt = new Date().toISOString(),
  deliveredAt?: string | null,
): Promise<void> {
  await saveMessageReceipts(messageId, { delivered_at: deliveredAt, read_at: readAt });
}

export async function deleteLocalMessage(messageId: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      const chatIds = await findWebMessageChatIds(messageId);
      for (const chatId of chatIds) {
        await updateWebMessages(chatId, (messages) => messages.filter((message) => message.id !== messageId));
        forgetWarmMessage(chatId, messageId);
      }
      return;
    }
    const db = await getDB();
    await db.runAsync("DELETE FROM messages WHERE id = ?", [messageId]);
    for (const [conversationId, messages] of warmMessages) {
      if (messages.some((message) => message.id === messageId)) forgetWarmMessage(conversationId, messageId);
    }
  } catch {}
}

export async function getPendingLocalMessages(): Promise<LocalMessage[]> {
  if (Platform.OS === "web") {
    const chatIds = await getWebMessageChatIds();
    await Promise.all(chatIds.map(waitForWebMessageWrites));
    const messages = (await Promise.all(chatIds.map((chatId) => readWebMessages(chatId)))).flat();
    return messages.filter((message) => message.is_pending).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  }
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM messages WHERE is_pending = 1 ORDER BY sent_at ASC",
  );
  return rows.map((r) => ({ ...r, is_pending: true, synced: false }));
}

/** User-initiated: delete ALL messages in a conversation from device. */
export async function deleteAllLocalMessages(conversationId: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      const { cacheMessages } = await import("../offlineStore");
      await waitForWebMessageWrites(conversationId);
      await cacheMessages(conversationId, []);
      warmMessages.delete(conversationId);
      warmMessageReads.delete(conversationId);
      return;
    }
    const db = await getDB();
    await db.runAsync("DELETE FROM messages WHERE conversation_id = ?", [conversationId]);
    warmMessages.delete(conversationId);
    warmMessageReads.delete(conversationId);
  } catch {}
}

// ─── Internal ───────────────────────────────────────────────────────────────────

function rowToMsg(r: any): LocalMessage {
  return {
    ...r,
    sender_display_name: r.sender_display_name ?? null,
    sender_avatar_url: r.sender_avatar_url ?? null,
    sender_handle: r.sender_handle ?? null,
    delivered_at: r.delivered_at ?? null,
    read_at: r.read_at ?? null,
    is_pending: r.is_pending === 1,
    synced: r.synced === 1,
  };
}
