import { Platform } from "react-native";

// ─── AfuChat Local Database ────────────────────────────────────────────────────
// Permanent on-device SQLite store — data lives here until the user explicitly
// deletes it or uninstalls the app. Nothing is auto-expired or auto-pruned.
// This is the same model WhatsApp / Telegram use: download once, keep forever.
//
// On native: expo-sqlite (SQLite 3).
// On web:    in-memory no-op stub (app is mobile-only; web preview doesn't persist data).

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
    // Web preview stub — app is mobile-only, no persistence on web
    return {
      execAsync: async () => {},
      runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
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

// ─── Schema migrations ──────────────────────────────────────────────────────────
// RULE: Never DROP columns or tables — only ADD. Migrations are permanent.

async function runMigrations(db: DB) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);`);
  const row = await db.getFirstAsync<{ version: number }>("SELECT version FROM schema_version LIMIT 1");
  const currentVersion = row?.version ?? 0;

  // ── v1: Core tables ──────────────────────────────────────────────────────────
  if (currentVersion < 1) {
    await db.execAsync(`
      -- Conversations (chat rooms) — permanent, never auto-deleted
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
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(is_pinned, last_message_at);

      -- Messages — permanent, never auto-deleted, never re-downloaded
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
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv_sent ON messages(conversation_id, sent_at ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_pending ON messages(is_pending) WHERE is_pending = 1;

      -- Feed posts — permanent once viewed/downloaded; only new posts fetched
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
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_feed_tab_created ON feed_posts(tab, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feed_created ON feed_posts(created_at DESC);

      -- Notifications — permanent
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
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(read_at) WHERE read_at IS NULL;

      -- Offline action queue (pending sync to server)
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

      -- Media registry: avatars + thumbnails stored permanently in documentDirectory
      CREATE TABLE IF NOT EXISTS media_cache (
        url_hash TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        local_path TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'image',
        file_size INTEGER NOT NULL DEFAULT 0,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_media_stored ON media_cache(stored_at);

      -- Video registry: watched videos stored permanently in documentDirectory
      CREATE TABLE IF NOT EXISTS video_registry (
        post_id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        file_uri TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '',
        thumbnail TEXT,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_video_stored ON video_registry(stored_at DESC);
    `);

    if (currentVersion === 0) {
      await db.runAsync("INSERT INTO schema_version (version) VALUES (1)");
    } else {
      await db.runAsync("UPDATE schema_version SET version = 1");
    }
  }

  // ── v2: Add delta-sync helpers (newest_at columns for cursors) ───────────────
  if (currentVersion < 2) {
    const safeAdd = async (sql: string) => { try { await db.execAsync(sql); } catch {} };
    await safeAdd("ALTER TABLE feed_posts ADD COLUMN viewed_at INTEGER");
    await safeAdd("ALTER TABLE feed_posts ADD COLUMN saved_to_tab TEXT");
    await db.runAsync("UPDATE schema_version SET version = 2");
  }

  // ── v3: Richer notification columns + permanent contacts table ────────────────
  if (currentVersion < 3) {
    const safeAdd = async (sql: string) => { try { await db.execAsync(sql); } catch {} };
    // Notifications — extra fields needed by the UI
    await safeAdd("ALTER TABLE notifications ADD COLUMN post_id TEXT");
    await safeAdd("ALTER TABLE notifications ADD COLUMN reference_id TEXT");
    await safeAdd("ALTER TABLE notifications ADD COLUMN reference_type TEXT");
    await safeAdd("ALTER TABLE notifications ADD COLUMN actor_handle TEXT");
    await safeAdd("ALTER TABLE notifications ADD COLUMN actor_is_verified INTEGER NOT NULL DEFAULT 0");
    await safeAdd("ALTER TABLE notifications ADD COLUMN actor_is_org_verified INTEGER NOT NULL DEFAULT 0");
    await safeAdd("ALTER TABLE notifications ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0");
    // Contacts — permanent, follows-based people list
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        handle TEXT NOT NULL,
        avatar_url TEXT,
        bio TEXT,
        is_verified INTEGER NOT NULL DEFAULT 0,
        is_organization_verified INTEGER NOT NULL DEFAULT 0,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(display_name COLLATE NOCASE);
    `);
    await db.runAsync("UPDATE schema_version SET version = 3");
  }

  // ── v4: Add file_name to media_cache (chat attachments) ──────────────────
  if (currentVersion < 4) {
    const safeAdd = async (sql: string) => { try { await db.execAsync(sql); } catch {} };
    await safeAdd("ALTER TABLE media_cache ADD COLUMN file_name TEXT");
    await db.runAsync("UPDATE schema_version SET version = 4");
  }

  // ── v5: Track which attachments have been mirrored to device storage ───────
  if (currentVersion < 5) {
    const safeAdd = async (sql: string) => { try { await db.execAsync(sql); } catch {} };
    await safeAdd("ALTER TABLE media_cache ADD COLUMN saved_to_device INTEGER NOT NULL DEFAULT 0");
    await db.runAsync("UPDATE schema_version SET version = 5");
  }

  // ── v6: Add last_accessed for LRU tracking + owner/message metadata ───────
  if (currentVersion < 6) {
    const safeAdd = async (sql: string) => { try { await db.execAsync(sql); } catch {} };
    // last_accessed: updated each time a cached file is served (for LRU eviction)
    await safeAdd("ALTER TABLE media_cache ADD COLUMN last_accessed INTEGER");
    // owner_id: user_id or conversation_id that owns this file
    await safeAdd("ALTER TABLE media_cache ADD COLUMN owner_id TEXT");
    // message_id: links a chat attachment to its originating message
    await safeAdd("ALTER TABLE media_cache ADD COLUMN message_id TEXT");
    // mime_type: stored once so we never have to guess from extension again
    await safeAdd("ALTER TABLE media_cache ADD COLUMN mime_type TEXT");
    // Backfill last_accessed = stored_at for existing rows
    await safeAdd("UPDATE media_cache SET last_accessed = stored_at WHERE last_accessed IS NULL");
    // Index for LRU queries (evict least-recently-accessed first)
    await safeAdd("CREATE INDEX IF NOT EXISTS idx_media_last_accessed ON media_cache(last_accessed)");
    await db.runAsync("UPDATE schema_version SET version = 6");
  }

  // ── v7: Phone book name overrides ────────────────────────────────────────
  // Maps app user IDs to the name the current user saved them as in their
  // phone contacts. Used to show the phone-book name in chats and a
  // "Saved as …" label everywhere else.
  if (currentVersion < 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS phone_contact_names (
        user_id TEXT PRIMARY KEY,
        phonebook_name TEXT NOT NULL,
        stored_at INTEGER NOT NULL
      );
    `);
    await db.runAsync("UPDATE schema_version SET version = 7");
  }

  // ── v9: Local call history ───────────────────────────────────────────────
  // Stores every call record on device for fully-offline call history.
  // Denormalizes caller/callee display info so the list renders without
  // a network fetch.
  if (currentVersion < 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS call_history (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL DEFAULT '',
        caller_id TEXT NOT NULL,
        callee_id TEXT NOT NULL,
        call_type TEXT NOT NULL DEFAULT 'voice',
        status TEXT NOT NULL DEFAULT 'ended',
        started_at TEXT NOT NULL,
        answered_at TEXT,
        ended_at TEXT,
        duration_seconds INTEGER,
        chat_id TEXT,
        caller_display_name TEXT,
        caller_avatar_url TEXT,
        caller_handle TEXT,
        callee_display_name TEXT,
        callee_avatar_url TEXT,
        callee_handle TEXT,
        stored_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_call_history_caller ON call_history(caller_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_call_history_callee ON call_history(callee_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_call_history_missed ON call_history(callee_id, status) WHERE status = 'missed';
    `);
    await db.runAsync("UPDATE schema_version SET version = 9");
  }

  // ── v10: Add watched_at to video_registry ────────────────────────────────
  // Separates "when did the user watch this?" from "when was it stored?".
  // watched_at is set each time markVideoWatched is called (updates on re-watch).
  // stored_at still records the first-download time (never updated after that).
  if (currentVersion < 10) {
    const safeAdd = async (sql: string) => { try { await db.execAsync(sql); } catch {} };
    await safeAdd("ALTER TABLE video_registry ADD COLUMN watched_at INTEGER");
    // Back-fill existing rows: treat stored_at as watched_at
    await safeAdd("UPDATE video_registry SET watched_at = stored_at WHERE watched_at IS NULL");
    await safeAdd(
      "CREATE INDEX IF NOT EXISTS idx_video_watched ON video_registry(watched_at DESC)",
    );
    await db.runAsync("UPDATE schema_version SET version = 10");
  }

  // ── v8: Own profile + full user settings on device ───────────────────────
  // user_profiles: the logged-in user's own profile (one row per account).
  // user_settings: all privacy/notification/chat settings stored permanently.
  if (currentVersion < 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        handle TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        banner_url TEXT,
        bio TEXT,
        phone_number TEXT,
        xp INTEGER NOT NULL DEFAULT 0,
        acoin INTEGER NOT NULL DEFAULT 0,
        current_grade TEXT NOT NULL DEFAULT '',
        is_verified INTEGER NOT NULL DEFAULT 0,
        is_private INTEGER NOT NULL DEFAULT 0,
        show_online_status INTEGER NOT NULL DEFAULT 1,
        country TEXT,
        website_url TEXT,
        language TEXT NOT NULL DEFAULT 'en',
        tipping_enabled INTEGER NOT NULL DEFAULT 0,
        is_admin INTEGER NOT NULL DEFAULT 0,
        is_support_staff INTEGER NOT NULL DEFAULT 0,
        is_organization_verified INTEGER NOT NULL DEFAULT 0,
        is_business_mode INTEGER NOT NULL DEFAULT 0,
        gender TEXT,
        date_of_birth TEXT,
        region TEXT,
        interests TEXT,
        onboarding_completed INTEGER NOT NULL DEFAULT 0,
        scheduled_deletion_at TEXT,
        created_at TEXT,
        stored_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        is_private INTEGER NOT NULL DEFAULT 0,
        show_online_status INTEGER NOT NULL DEFAULT 1,
        show_last_seen INTEGER NOT NULL DEFAULT 1,
        show_bio_publicly INTEGER NOT NULL DEFAULT 1,
        hide_followers_list INTEGER NOT NULL DEFAULT 0,
        hide_following_list INTEGER NOT NULL DEFAULT 0,
        hide_posts_non_followers INTEGER NOT NULL DEFAULT 0,
        hide_from_search INTEGER NOT NULL DEFAULT 0,
        message_privacy TEXT NOT NULL DEFAULT 'everyone',
        reactions_privacy TEXT NOT NULL DEFAULT 'everyone',
        allow_tagging TEXT NOT NULL DEFAULT 'everyone',
        data_personalization INTEGER NOT NULL DEFAULT 1,
        data_analytics INTEGER NOT NULL DEFAULT 1,
        notif_likes INTEGER NOT NULL DEFAULT 1,
        notif_comments INTEGER NOT NULL DEFAULT 1,
        notif_follows INTEGER NOT NULL DEFAULT 1,
        notif_messages INTEGER NOT NULL DEFAULT 1,
        notif_mentions INTEGER NOT NULL DEFAULT 1,
        notif_reposts INTEGER NOT NULL DEFAULT 1,
        notif_tips INTEGER NOT NULL DEFAULT 1,
        notif_system INTEGER NOT NULL DEFAULT 1,
        notif_stories INTEGER NOT NULL DEFAULT 1,
        notif_live INTEGER NOT NULL DEFAULT 1,
        chat_read_receipts INTEGER NOT NULL DEFAULT 1,
        chat_media_autodownload TEXT NOT NULL DEFAULT 'wifi_only',
        chat_bubble_style TEXT NOT NULL DEFAULT 'default',
        app_language TEXT NOT NULL DEFAULT 'en',
        app_theme TEXT NOT NULL DEFAULT 'system',
        stored_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
    `);
    await db.runAsync("UPDATE schema_version SET version = 8");
  }
}
