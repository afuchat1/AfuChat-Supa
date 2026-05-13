// ─── Local Call History ────────────────────────────────────────────────────────
// Stores every call (completed, missed, declined) in SQLite so call history
// is available fully offline. The Supabase `calls` table remains the source
// of truth for signaling; this is the local read cache + missed-call store.
//
// Schema: call_history table (created in DB migration v9)
// RULES:
//   • INSERT OR REPLACE — latest server record always wins
//   • No TTL — history lives until user explicitly clears it
//   • Sorted by started_at DESC for display

import { getDB } from "./db";

export type LocalCallRecord = {
  id: string;
  room_id: string;
  caller_id: string;
  callee_id: string;
  call_type: "voice" | "video";
  status: "ringing" | "active" | "ended" | "declined" | "missed" | "busy";
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  chat_id: string | null;
  // Denormalized caller/callee info for offline display
  caller_display_name: string | null;
  caller_avatar_url: string | null;
  caller_handle: string | null;
  callee_display_name: string | null;
  callee_avatar_url: string | null;
  callee_handle: string | null;
  stored_at: number;
};

// ─── Write ─────────────────────────────────────────────────────────────────────

/** Upsert a call record into local storage. Call this when a call ends. */
export async function saveLocalCall(record: {
  id: string;
  room_id?: string;
  caller_id: string;
  callee_id: string;
  call_type: "voice" | "video";
  status: string;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  chat_id?: string | null;
  caller?: { display_name?: string; avatar_url?: string; handle?: string } | null;
  callee?: { display_name?: string; avatar_url?: string; handle?: string } | null;
}): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO call_history (
        id, room_id, caller_id, callee_id, call_type, status,
        started_at, answered_at, ended_at, duration_seconds, chat_id,
        caller_display_name, caller_avatar_url, caller_handle,
        callee_display_name, callee_avatar_url, callee_handle,
        stored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.room_id ?? "",
        record.caller_id,
        record.callee_id,
        record.call_type,
        record.status,
        record.started_at ?? new Date().toISOString(),
        record.answered_at ?? null,
        record.ended_at ?? null,
        record.duration_seconds ?? null,
        record.chat_id ?? null,
        record.caller?.display_name ?? null,
        record.caller?.avatar_url ?? null,
        record.caller?.handle ?? null,
        record.callee?.display_name ?? null,
        record.callee?.avatar_url ?? null,
        record.callee?.handle ?? null,
        Date.now(),
      ],
    );
  } catch {}
}

// ─── Read ──────────────────────────────────────────────────────────────────────

/** Fetch the N most recent calls for a user (as caller or callee). */
export async function getLocalCallHistory(
  userId: string,
  limit = 50,
): Promise<LocalCallRecord[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<LocalCallRecord>(
      `SELECT * FROM call_history
       WHERE caller_id = ? OR callee_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
      [userId, userId, limit],
    );
    return rows ?? [];
  } catch {
    return [];
  }
}

/** Fetch only missed calls for a user (callee side, status = missed). */
export async function getLocalMissedCalls(userId: string): Promise<LocalCallRecord[]> {
  try {
    const db = await getDB();
    return await db.getAllAsync<LocalCallRecord>(
      `SELECT * FROM call_history
       WHERE callee_id = ? AND status = 'missed'
       ORDER BY started_at DESC
       LIMIT 100`,
      [userId],
    ) ?? [];
  } catch {
    return [];
  }
}

/** Count unread missed calls (status = missed, answered_at IS NULL). */
export async function getMissedCallCount(userId: string): Promise<number> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) as n FROM call_history WHERE callee_id = ? AND status = 'missed'`,
      [userId],
    );
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

// ─── Delete ────────────────────────────────────────────────────────────────────

/** Remove a single call record. */
export async function deleteLocalCall(callId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM call_history WHERE id = ?", [callId]);
  } catch {}
}

/** Wipe all local call history (user-initiated clear). */
export async function clearLocalCallHistory(userId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "DELETE FROM call_history WHERE caller_id = ? OR callee_id = ?",
      [userId, userId],
    );
  } catch {}
}
