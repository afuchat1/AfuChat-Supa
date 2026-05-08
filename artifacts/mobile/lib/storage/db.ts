import { Platform } from "react-native";

// ─── Local SQLite Database ─────────────────────────────────────────────────────
// This is AfuChat's on-device relational store — exactly how WhatsApp/Telegram
// keep messages available instantly without a network round-trip.
//
// On native: uses expo-sqlite (SQLite3).
// On web: expo-sqlite now ships a SQLite Wasm build, so the same code runs
// everywhere, but we guard native-only APIs behind Platform checks.

export type DB = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
};

let _db: DB | null = null;
let _initPromise: Promise<DB> | null = null;

async function openDB(): Promise<DB> {
  if (Platform.OS === "web") {
    const SQLite = await import("expo-sqlite/legacy");
    const db = SQLite.openDatabase("afuchat_local.db");
    return {
      execAsync: (sql) => new Promise((res, rej) => db.exec([{ sql, args: [] }], false, (err) => (err ? rej(err) : res()))),
      runAsync: (sql, params = []) => new Promise((res, rej) =>
        db.transaction((tx) => tx.executeSql(sql, params, (_, r) => res({ lastInsertRowId: r.insertId ?? 0, changes: r.rowsAffected }), (_, e) => { rej(e); return true; }))
      ),
      getAllAsync: <T>(sql: string, params: any[] = []) => new Promise<T[]>((res, rej) =>
        db.transaction((tx) => tx.executeSql(sql, params, (_, r) => res(r.rows._array as T[]), (_, e) => { rej(e); return true; }))
      ),
      getFirstAsync: <T>(sql: string, params: any[] = []) => new Promise<T | null>((res, rej) =>
        db.transaction((tx) => tx.executeSql(sql, params, (_, r) => res((r.rows._array[0] as T) ?? null), (_, e) => { rej(e); return true; }))
      ),
    };
  }

  const { openDatabaseAsync } = await import("expo-sqlite");
  const db = await openDatabaseAsync("afuchat_local.db", { enableChangeListener: false });
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params),
    getAllAsync: <T>(sql: string, params: any[] = []) => db.getAllAsync<T>(sql, params),
    getFirstAsync: <T>(sql: string, params: any[] = []) => db.getFirstAsync<T>(sql, params),
  };
}

export async function getDB(): Promise<DB> {
  if (_db) return _db;
  if (_initPromise) return _initPromise;
  _initPromise = openDB().then(async (db) => {
    await runMigrations(db);
    _db = db;
    return db;
  });
  return _initPromise;
}

// ─── Schema migrations ─────────────────────────────────────────────────────────

async function runMigrations(db: DB) {
  // Version table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
  `);

  const row = await db.getFirstAsync<{ version: number }>("SELECT version FROM schema_version LIMIT 1");
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(`
      -- Conversations (chat rooms)
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        name TEXT,
        is_group INTEGER NOT NULL DEFAULT 0,
        is_channel INTEGER NOT NULL DEFAULT 0,
        other_id TEXT,
        other_display_name TEXT,
        other_avatar TEXT,
        last_message TEXT,
        last_message_at TEXT,
        last_message_is_mine INTEGER NOT NULL DEFAULT 0,
        last_message_status TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        avatar_url TEXT,
        unread_count INTEGER NOT NULL DEFAULT 0,
        is_verified INTEGER NOT NULL DEFAULT 0,
        is_organization_verified INTEGER NOT NULL DEFAULT 0,
        other_last_seen TEXT,
        other_show_online INTEGER NOT NULL DEFAULT 1,
        cached_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_cached ON conversations(cached_at);
      CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(is_pinned, last_message_at);

      -- Messages
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT,
        attachment_url TEXT,
        attachment_type TEXT,
        reply_to_id TEXT,
        status TEXT NOT NULL DEFAULT 'sent',
        sent_at TEXT NOT NULL,
        edited_at TEXT,
        is_pending INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 1,
        cached_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_pending ON messages(is_pending) WHERE is_pending = 1;

      -- Feed posts
      CREATE TABLE IF NOT EXISTS feed_posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        content TEXT,
        image_url TEXT,
        images TEXT,
        video_url TEXT,
        post_type TEXT,
        article_title TEXT,
        created_at TEXT NOT NULL,
        like_count INTEGER NOT NULL DEFAULT 0,
        reply_count INTEGER NOT NULL DEFAULT 0,
        view_count INTEGER NOT NULL DEFAULT 0,
        liked INTEGER NOT NULL DEFAULT 0,
        bookmarked INTEGER NOT NULL DEFAULT 0,
        author_name TEXT,
        author_handle TEXT,
        author_avatar TEXT,
        is_verified INTEGER NOT NULL DEFAULT 0,
        is_org_verified INTEGER NOT NULL DEFAULT 0,
        tab TEXT NOT NULL DEFAULT 'for_you',
        score REAL NOT NULL DEFAULT 0,
        cached_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_feed_tab ON feed_posts(tab, score DESC);
      CREATE INDEX IF NOT EXISTS idx_feed_created ON feed_posts(created_at DESC);

      -- Notifications
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        actor_avatar TEXT,
        target_id TEXT,
        body TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(read_at) WHERE read_at IS NULL;

      -- Offline action queue
      CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_queue_created ON offline_queue(created_at ASC);

      -- Search history
      CREATE TABLE IF NOT EXISTS search_history (
        query TEXT PRIMARY KEY,
        used_at INTEGER NOT NULL
      );

      -- Media cache registry (thumbnails, avatars)
      CREATE TABLE IF NOT EXISTS media_cache (
        url_hash TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        local_path TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'image',
        file_size INTEGER NOT NULL DEFAULT 0,
        cached_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_media_cached ON media_cache(cached_at);
    `);

    if (currentVersion === 0) {
      await db.runAsync("INSERT INTO schema_version (version) VALUES (1)");
    } else {
      await db.runAsync("UPDATE schema_version SET version = 1");
    }
  }
}
