// ─── Permanent Message Store ────────────────────────────────────────────────────
// Messages are stored once and never re-downloaded.
// Delta sync: we track the newest sent_at on device and only fetch from server
// messages NEWER than that — exactly how WhatsApp / Telegram work.
//
// RULES:
//   • INSERT OR IGNORE  — never overwrite an existing message row
//   • No TTL, no auto-trim — messages live until the user deletes the conversation
//   • getNewestMessageDate() → cursor for delta sync

import { getDB } from "./db";
import { autoDownloadAttachment } from "./mediaDownloader";

export type LocalMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  reply_to_id: string | null;
  status: string;
  sent_at: string;
  edited_at: string | null;
  is_pending: boolean;
  synced: boolean;
};

export function mapToLocal(msg: any, conversationId: string): LocalMessage {
  return {
    id: msg.id,
    conversation_id: conversationId,
    sender_id: msg.sender_id,
    content: msg.encrypted_content ?? msg.content ?? null,
    attachment_url: msg.attachment_url ?? null,
    attachment_type: msg.attachment_type ?? null,
    reply_to_id: msg.reply_to_message_id ?? null,
    status: msg.status ?? "sent",
    sent_at: msg.sent_at ?? msg.created_at ?? new Date().toISOString(),
    edited_at: msg.edited_at ?? null,
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
): Promise<LocalMessage[]> {
  try {
    const db = await getDB();
    let rows: any[];
    if (beforeSentAt) {
      rows = await db.getAllAsync<any>(
        `SELECT * FROM messages
         WHERE conversation_id = ? AND sent_at < ?
         ORDER BY sent_at DESC LIMIT ?`,
        [conversationId, beforeSentAt, limit],
      );
      rows.reverse();
    } else {
      rows = await db.getAllAsync<any>(
        `SELECT * FROM (
           SELECT * FROM messages
           WHERE conversation_id = ?
           ORDER BY sent_at DESC LIMIT ?
         ) ORDER BY sent_at ASC`,
        [conversationId, limit],
      );
    }
    return rows.map(rowToMsg);
  } catch {
    return [];
  }
}

/**
 * Returns the sent_at of the newest message stored locally for this conversation.
 * Used as the delta-sync cursor — only messages AFTER this are fetched from server.
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
 * are never overwritten or re-downloaded. Only edited_at and status may be updated.
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
          reply_to_id, status, sent_at, edited_at, is_pending, synced, stored_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          local.is_pending ? 1 : 0,
          local.synced ? 1 : 0,
          now,
        ],
      );
      // Allow status and edited_at to be updated on existing rows (delivery receipts)
      if (msg.status || msg.edited_at) {
        await db.runAsync(
          `UPDATE messages SET
             status = COALESCE(?, status),
             edited_at = COALESCE(?, edited_at)
           WHERE id = ?`,
          [msg.status ?? null, msg.edited_at ?? null, local.id],
        );
      }
      // Fire-and-forget: auto-download attachment to permanent device storage
      if (local.attachment_url && local.attachment_type && local.attachment_type !== "video") {
        autoDownloadAttachment(
          local.id,
          local.attachment_url,
          local.attachment_type as any,
        ).catch(() => {});
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
}): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO messages
       (id, conversation_id, sender_id, content, attachment_url, attachment_type,
        reply_to_id, status, sent_at, edited_at, is_pending, synced, stored_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'sending', ?, NULL, 1, 0, ?)`,
      [
        msg.id, msg.conversation_id, msg.sender_id, msg.content,
        msg.attachment_url ?? null, msg.attachment_type ?? null,
        msg.sent_at, Date.now(),
      ],
    );
  } catch {}
}

export async function markMessageSynced(localId: string, serverId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE messages SET id = ?, is_pending = 0, synced = 1, status = 'sent' WHERE id = ?",
      [serverId, localId],
    );
  } catch {}
}

export async function markMessageDelivered(messageId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("UPDATE messages SET status = 'delivered' WHERE id = ?", [messageId]);
  } catch {}
}

export async function markMessageRead(messageId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("UPDATE messages SET status = 'read' WHERE id = ?", [messageId]);
  } catch {}
}

export async function deleteLocalMessage(messageId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM messages WHERE id = ?", [messageId]);
  } catch {}
}

export async function getPendingLocalMessages(): Promise<LocalMessage[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM messages WHERE is_pending = 1 ORDER BY sent_at ASC",
    );
    return rows.map((r) => ({ ...r, is_pending: true, synced: false }));
  } catch {
    return [];
  }
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
    is_pending: r.is_pending === 1,
    synced: r.synced === 1,
  };
}
