import { getDB } from "./db";

export type LocalConversation = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_channel: boolean;
  other_id: string | null;
  other_display_name: string | null;
  other_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_is_mine: boolean;
  last_message_status: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  avatar_url: string | null;
  unread_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  other_last_seen: string | null;
  other_show_online: boolean;
  cached_at: number;
};

// Convert server shape → local row
export function mapConversation(item: any): LocalConversation {
  return {
    id: item.id,
    name: item.name ?? null,
    is_group: item.is_group ?? false,
    is_channel: item.is_channel ?? false,
    other_id: item.other_id ?? null,
    other_display_name: item.other_display_name ?? null,
    other_avatar: item.other_avatar ?? null,
    last_message: item.last_message ?? null,
    last_message_at: item.last_message_at ?? null,
    last_message_is_mine: item.last_message_is_mine ?? false,
    last_message_status: item.last_message_status ?? null,
    is_pinned: item.is_pinned ?? false,
    is_archived: item.is_archived ?? false,
    avatar_url: item.avatar_url ?? null,
    unread_count: item.unread_count ?? 0,
    is_verified: item.is_verified ?? false,
    is_organization_verified: item.is_organization_verified ?? false,
    other_last_seen: item.other_last_seen ?? null,
    other_show_online: item.other_show_online ?? true,
    cached_at: Date.now(),
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────────

export async function getLocalConversations(includeArchived = false): Promise<LocalConversation[]> {
  try {
    const db = await getDB();
    const sql = includeArchived
      ? `SELECT * FROM conversations ORDER BY is_pinned DESC, last_message_at DESC`
      : `SELECT * FROM conversations WHERE is_archived = 0 ORDER BY is_pinned DESC, last_message_at DESC`;
    const rows = await db.getAllAsync<any>(sql);
    return rows.map(rowToConv);
  } catch {
    return [];
  }
}

export async function getLocalConversation(id: string): Promise<LocalConversation | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<any>(
      "SELECT * FROM conversations WHERE id = ?",
      [id],
    );
    return row ? rowToConv(row) : null;
  } catch {
    return null;
  }
}

export async function hasLocalConversations(): Promise<boolean> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM conversations",
    );
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Writes ────────────────────────────────────────────────────────────────────

export async function saveConversations(items: any[]): Promise<void> {
  if (!items.length) return;
  try {
    const db = await getDB();
    const now = Date.now();
    for (const item of items) {
      const c = mapConversation(item);
      await db.runAsync(
        `INSERT OR REPLACE INTO conversations
         (id, name, is_group, is_channel, other_id, other_display_name, other_avatar,
          last_message, last_message_at, last_message_is_mine, last_message_status,
          is_pinned, is_archived, avatar_url, unread_count, is_verified,
          is_organization_verified, other_last_seen, other_show_online, cached_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          c.id, c.name, c.is_group ? 1 : 0, c.is_channel ? 1 : 0,
          c.other_id, c.other_display_name, c.other_avatar,
          c.last_message, c.last_message_at, c.last_message_is_mine ? 1 : 0,
          c.last_message_status, c.is_pinned ? 1 : 0, c.is_archived ? 1 : 0,
          c.avatar_url, c.unread_count, c.is_verified ? 1 : 0,
          c.is_organization_verified ? 1 : 0, c.other_last_seen,
          c.other_show_online ? 1 : 0, now,
        ],
      );
    }
  } catch {}
}

export async function updateConversationLastMessage(
  id: string,
  lastMessage: string,
  sentAt: string,
  isMine: boolean,
): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `UPDATE conversations SET last_message = ?, last_message_at = ?,
       last_message_is_mine = ?, last_message_status = 'sent', cached_at = ?
       WHERE id = ?`,
      [lastMessage, sentAt, isMine ? 1 : 0, Date.now(), id],
    );
  } catch {}
}

export async function incrementUnread(conversationId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE conversations SET unread_count = unread_count + 1 WHERE id = ?",
      [conversationId],
    );
  } catch {}
}

export async function clearUnread(conversationId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE conversations SET unread_count = 0 WHERE id = ?",
      [conversationId],
    );
  } catch {}
}

export async function deleteLocalConversation(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM conversations WHERE id = ?", [id]);
    await db.runAsync("DELETE FROM messages WHERE conversation_id = ?", [id]);
  } catch {}
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function rowToConv(r: any): LocalConversation {
  return {
    ...r,
    is_group: r.is_group === 1,
    is_channel: r.is_channel === 1,
    last_message_is_mine: r.last_message_is_mine === 1,
    is_pinned: r.is_pinned === 1,
    is_archived: r.is_archived === 1,
    is_verified: r.is_verified === 1,
    is_organization_verified: r.is_organization_verified === 1,
    other_show_online: r.other_show_online === 1,
  };
}
