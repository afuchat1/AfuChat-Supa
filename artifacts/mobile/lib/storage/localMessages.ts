import { getDB } from "./db";

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

// Map from the Supabase shape to our local shape
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

// ─── Reads ─────────────────────────────────────────────────────────────────────

export async function getLocalMessages(conversationId: string, limit = 60): Promise<LocalMessage[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY sent_at ASC
       LIMIT ?`,
      [conversationId, limit],
    );
    return rows.map((r) => ({
      ...r,
      is_pending: r.is_pending === 1,
      synced: r.synced === 1,
    }));
  } catch {
    return [];
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

// ─── Writes ────────────────────────────────────────────────────────────────────

export async function saveMessages(conversationId: string, messages: any[]): Promise<void> {
  if (!messages.length) return;
  try {
    const db = await getDB();
    const now = Date.now();
    for (const msg of messages) {
      const local = mapToLocal(msg, conversationId);
      await db.runAsync(
        `INSERT OR REPLACE INTO messages
         (id, conversation_id, sender_id, content, attachment_url, attachment_type,
          reply_to_id, status, sent_at, edited_at, is_pending, synced, cached_at)
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
    }
  } catch {}
}

export async function savePendingMessage(msg: {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  sent_at: string;
}): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO messages
       (id, conversation_id, sender_id, content, attachment_url, attachment_type,
        reply_to_id, status, sent_at, edited_at, is_pending, synced, cached_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, 'sending', ?, NULL, 1, 0, ?)`,
      [msg.id, msg.conversation_id, msg.sender_id, msg.content, msg.sent_at, Date.now()],
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

// Trim old messages to keep storage lean — keep only the last N per conversation
export async function trimMessages(conversationId: string, keep = 200): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `DELETE FROM messages WHERE conversation_id = ? AND id NOT IN (
         SELECT id FROM messages WHERE conversation_id = ?
         ORDER BY sent_at DESC LIMIT ?
       )`,
      [conversationId, conversationId, keep],
    );
  } catch {}
}
