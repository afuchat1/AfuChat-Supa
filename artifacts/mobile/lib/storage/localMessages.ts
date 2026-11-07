// ─── Permanent Message Store ────────────────────────────────────────────────────
// Messages are persisted locally and merged with bounded server backfills.
// Chat opening backfills the latest server page; older locally cached history
// remains available for paging without repeatedly downloading the full thread.
//
// RULES:
//   • INSERT OR IGNORE  — never overwrite message content; fill sender snapshots safely
//   • No TTL, no auto-trim — messages live until the user deletes the conversation
//   • Keep delivery/read receipt timestamps beside the message for offline info

import { getDB } from "./db";
import { Platform } from "react-native";
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
    reply_to_id: msg.reply_to_message_id ?? null,
    status: msg.status ?? "sent",
    sent_at: msg.sent_at ?? msg.created_at ?? new Date().toISOString(),
    edited_at: msg.edited_at ?? null,
    delivered_at: msg.delivered_at ?? null,
    read_at: msg.read_at ?? null,
    is_pending: msg._pending ?? false,
    synced: true,
  };
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
      const { getPendingMessages } = await import("../offlineStore");
      const queued = await getPendingMessages();
      return queued
        .filter((msg) => msg.chat_id === conversationId)
        .map((msg) => ({
          id: msg.id,
          conversation_id: conversationId,
          sender_id: msg.sender_id,
          sender_display_name: msg.sender_display_name ?? null,
          sender_avatar_url: msg.sender_avatar_url ?? null,
          sender_handle: msg.sender_handle ?? null,
          content: msg.encrypted_content,
          attachment_url: null,
          attachment_type: null,
          reply_to_id: msg.reply_to_message_id ?? null,
          status: "sending",
          sent_at: msg.created_at,
          edited_at: null,
          delivered_at: null,
          read_at: null,
          is_pending: true,
          synced: false,
        }))
        .filter((msg) => !beforeSentAt || msg.sent_at < beforeSentAt)
        .filter((msg) => !afterSentAt || msg.sent_at > afterSentAt)
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
        .slice(-limit);
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
    return rows.map(rowToMsg);
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

export async function getOldestMessageDate(conversationId: string): Promise<string | null> {
  try {
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
 * are never overwritten. Status, receipt timestamps, edited_at, and non-empty
 * sender identity snapshots may be refreshed without erasing known values.
 */
export async function saveMessages(conversationId: string, messages: any[]): Promise<void> {
  if (!messages.length) return;
  try {
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
             status = CASE
               WHEN status = 'read' OR ? = 'read' THEN 'read'
               WHEN status = 'delivered' OR ? = 'delivered' THEN 'delivered'
               WHEN ? IS NOT NULL THEN ?
               ELSE status
             END,
             edited_at = COALESCE(?, edited_at),
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
            msg.status ?? null,
            msg.status ?? null,
            msg.status ?? null,
            msg.status ?? null,
            msg.edited_at ?? null,
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
}

export async function markMessageSynced(localId: string, serverId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    "UPDATE messages SET id = ?, is_pending = 0, synced = 1, status = 'sent' WHERE id = ?",
    [serverId, localId],
  );
}

export async function saveMessageReceipts(
  messageId: string,
  receipts: { delivered_at?: string | null; read_at?: string | null },
): Promise<void> {
  if (!receipts.delivered_at && !receipts.read_at) return;
  try {
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
    const db = await getDB();
    await db.runAsync("DELETE FROM messages WHERE id = ?", [messageId]);
  } catch {}
}

export async function getPendingLocalMessages(): Promise<LocalMessage[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM messages WHERE is_pending = 1 ORDER BY sent_at ASC",
  );
  return rows.map((r) => ({ ...r, is_pending: true, synced: false }));
}

/** User-initiated: delete ALL messages in a conversation from device. */
export async function deleteAllLocalMessages(conversationId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM messages WHERE conversation_id = ?", [conversationId]);
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
