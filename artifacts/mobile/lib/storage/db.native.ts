import { openDatabaseAsync } from "expo-sqlite";

export type DB = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
};

let _db: DB | null = null;
let _initPromise: Promise<DB> | null = null;

async function openDB(): Promise<DB> {
  const db = await openDatabaseAsync("afuchat_local.db", { enableChangeListener: false });
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params),
    getAllAsync: <T>(sql: string, params: any[] = []) => db.getAllAsync<T>(sql, params),
    getFirstAsync: <T>(sql: string, params: any[] = []) => db.getFirstAsync<T>(sql, params),
  };
}

async function execSchemaChange(db: DB, sql: string): Promise<void> {
  try {
    await db.execAsync(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isReplayOfAddedColumn =
      /^\s*ALTER\s+TABLE\b[\s\S]*\bADD\s+COLUMN\b/i.test(sql) &&
      /duplicate column name/i.test(message);
    const isReplayOfDroppedColumn =
      /^\s*ALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN\b/i.test(sql) &&
      /no such column/i.test(message);
    if (isReplayOfAddedColumn || isReplayOfDroppedColumn) return;
    throw error;
  }
}

export async function getDB(): Promise<DB> {
  if (_db) return _db;
  if (_initPromise) return _initPromise;
  _initPromise = openDB().then(async (db) => {
    await runMigrations(db);
    _db = db;
    return db;
  }).catch((error) => {
    // A failed migration must not poison every later caller with the same
    // rejected promise. The next sync/bootstrap pass can retry cleanly.
    _initPromise = null;
    throw error;
  });
  return _initPromise;
}

async function runMigrations(db: DB) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);`);
  const row = await db.getFirstAsync<{ version: number }>("SELECT version FROM schema_version LIMIT 1");
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, name TEXT, is_group INTEGER NOT NULL DEFAULT 0,
        is_channel INTEGER NOT NULL DEFAULT 0, other_id TEXT, other_display_name TEXT,
        other_avatar TEXT, last_message TEXT, last_message_at TEXT,
        last_message_is_mine INTEGER NOT NULL DEFAULT 0, last_message_status TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0,
        avatar_url TEXT, unread_count INTEGER NOT NULL DEFAULT 0,
        is_verified INTEGER NOT NULL DEFAULT 0, is_organization_verified INTEGER NOT NULL DEFAULT 0,
        other_last_seen TEXT, other_show_online INTEGER NOT NULL DEFAULT 1,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(is_pinned, last_message_at);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
        content TEXT, attachment_url TEXT, attachment_type TEXT, reply_to_id TEXT,
        status TEXT NOT NULL DEFAULT 'sent', sent_at TEXT NOT NULL, edited_at TEXT,
        is_pending INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 1,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv_sent ON messages(conversation_id, sent_at ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_pending ON messages(is_pending) WHERE is_pending = 1;
      CREATE TABLE IF NOT EXISTS feed_posts (
        id TEXT PRIMARY KEY, author_id TEXT NOT NULL, content TEXT, image_url TEXT,
        images TEXT, video_url TEXT, post_type TEXT, article_title TEXT,
        created_at TEXT NOT NULL, like_count INTEGER NOT NULL DEFAULT 0,
        reply_count INTEGER NOT NULL DEFAULT 0, view_count INTEGER NOT NULL DEFAULT 0,
        liked INTEGER NOT NULL DEFAULT 0, bookmarked INTEGER NOT NULL DEFAULT 0,
        author_name TEXT, author_handle TEXT, author_avatar TEXT,
        is_verified INTEGER NOT NULL DEFAULT 0, is_org_verified INTEGER NOT NULL DEFAULT 0,
        tab TEXT NOT NULL DEFAULT 'for_you', score REAL NOT NULL DEFAULT 0,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_feed_tab_created ON feed_posts(tab, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feed_created ON feed_posts(created_at DESC);
      CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY, action_type TEXT NOT NULL, payload TEXT NOT NULL,
        created_at INTEGER NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0, last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_queue_created ON offline_queue(created_at ASC);
      CREATE TABLE IF NOT EXISTS search_history (query TEXT PRIMARY KEY, used_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS media_cache (
        url_hash TEXT PRIMARY KEY, url TEXT NOT NULL, local_path TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'image', file_size INTEGER NOT NULL DEFAULT 0,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_media_stored ON media_cache(stored_at);
      CREATE TABLE IF NOT EXISTS video_registry (
        post_id TEXT PRIMARY KEY, url TEXT NOT NULL, file_uri TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT '',
        thumbnail TEXT, stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_video_stored ON video_registry(stored_at DESC);
    `);
    if (currentVersion === 0) {
      await db.runAsync("INSERT INTO schema_version (version) VALUES (1)");
    } else {
      await db.runAsync("UPDATE schema_version SET version = 1");
    }
  }

  if (currentVersion < 2) {
    await execSchemaChange(db, "ALTER TABLE feed_posts ADD COLUMN viewed_at INTEGER");
    await execSchemaChange(db, "ALTER TABLE feed_posts ADD COLUMN saved_to_tab TEXT");
    await db.runAsync("UPDATE schema_version SET version = 2");
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY, display_name TEXT NOT NULL, handle TEXT NOT NULL,
        avatar_url TEXT, bio TEXT, is_verified INTEGER NOT NULL DEFAULT 0,
        is_organization_verified INTEGER NOT NULL DEFAULT 0, stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(display_name COLLATE NOCASE);
    `);
    await db.runAsync("UPDATE schema_version SET version = 3");
  }

  if (currentVersion < 4) {
    await execSchemaChange(db, "ALTER TABLE media_cache ADD COLUMN file_name TEXT");
    await db.runAsync("UPDATE schema_version SET version = 4");
  }

  if (currentVersion < 5) {
    await execSchemaChange(db, "ALTER TABLE media_cache ADD COLUMN saved_to_device INTEGER NOT NULL DEFAULT 0");
    await db.runAsync("UPDATE schema_version SET version = 5");
  }

  if (currentVersion < 6) {
    await execSchemaChange(db, "ALTER TABLE media_cache ADD COLUMN last_accessed INTEGER");
    await execSchemaChange(db, "ALTER TABLE media_cache ADD COLUMN owner_id TEXT");
    await execSchemaChange(db, "ALTER TABLE media_cache ADD COLUMN message_id TEXT");
    await execSchemaChange(db, "ALTER TABLE media_cache ADD COLUMN mime_type TEXT");
    await db.execAsync("UPDATE media_cache SET last_accessed = stored_at WHERE last_accessed IS NULL");
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_media_last_accessed ON media_cache(last_accessed)");
    await db.runAsync("UPDATE schema_version SET version = 6");
  }

  if (currentVersion < 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS phone_contact_names (
        user_id TEXT PRIMARY KEY, phonebook_name TEXT NOT NULL, stored_at INTEGER NOT NULL
      );
    `);
    await db.runAsync("UPDATE schema_version SET version = 7");
  }

  if (currentVersion < 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY, handle TEXT NOT NULL, display_name TEXT NOT NULL,
        avatar_url TEXT, banner_url TEXT, bio TEXT, phone_number TEXT,
        xp INTEGER NOT NULL DEFAULT 0, acoin INTEGER NOT NULL DEFAULT 0,
        current_grade TEXT NOT NULL DEFAULT '', is_verified INTEGER NOT NULL DEFAULT 0,
        is_private INTEGER NOT NULL DEFAULT 0, show_online_status INTEGER NOT NULL DEFAULT 1,
        country TEXT, website_url TEXT, language TEXT NOT NULL DEFAULT 'en',
        tipping_enabled INTEGER NOT NULL DEFAULT 0, is_admin INTEGER NOT NULL DEFAULT 0,
        is_support_staff INTEGER NOT NULL DEFAULT 0, is_organization_verified INTEGER NOT NULL DEFAULT 0,
        is_business_mode INTEGER NOT NULL DEFAULT 0, gender TEXT, date_of_birth TEXT,
        region TEXT, interests TEXT, onboarding_completed INTEGER NOT NULL DEFAULT 0,
        scheduled_deletion_at TEXT, created_at TEXT, stored_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY, is_private INTEGER NOT NULL DEFAULT 0,
        show_online_status INTEGER NOT NULL DEFAULT 1, show_last_seen INTEGER NOT NULL DEFAULT 1,
        show_bio_publicly INTEGER NOT NULL DEFAULT 1, hide_followers_list INTEGER NOT NULL DEFAULT 0,
        hide_following_list INTEGER NOT NULL DEFAULT 0, hide_posts_non_followers INTEGER NOT NULL DEFAULT 0,
        hide_from_search INTEGER NOT NULL DEFAULT 0, message_privacy TEXT NOT NULL DEFAULT 'everyone',
        reactions_privacy TEXT NOT NULL DEFAULT 'everyone', allow_tagging TEXT NOT NULL DEFAULT 'everyone',
        data_personalization INTEGER NOT NULL DEFAULT 1, data_analytics INTEGER NOT NULL DEFAULT 1,
        chat_read_receipts INTEGER NOT NULL DEFAULT 1,
        chat_media_autodownload TEXT NOT NULL DEFAULT 'wifi_only',
        chat_bubble_style TEXT NOT NULL DEFAULT 'default', app_language TEXT NOT NULL DEFAULT 'en',
        app_theme TEXT NOT NULL DEFAULT 'system', stored_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
    `);
    await db.runAsync("UPDATE schema_version SET version = 8");
  }

  if (currentVersion < 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS call_history (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL DEFAULT '', caller_id TEXT NOT NULL,
        callee_id TEXT NOT NULL, call_type TEXT NOT NULL DEFAULT 'voice',
        status TEXT NOT NULL DEFAULT 'ended', started_at TEXT NOT NULL,
        answered_at TEXT, ended_at TEXT, duration_seconds INTEGER, chat_id TEXT,
        caller_display_name TEXT, caller_avatar_url TEXT, caller_handle TEXT,
        callee_display_name TEXT, callee_avatar_url TEXT, callee_handle TEXT,
        stored_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_call_history_caller ON call_history(caller_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_call_history_callee ON call_history(callee_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_call_history_missed ON call_history(callee_id, status) WHERE status = 'missed';
    `);
    await db.runAsync("UPDATE schema_version SET version = 9");
  }

  if (currentVersion < 10) {
    await execSchemaChange(db, "ALTER TABLE video_registry ADD COLUMN watched_at INTEGER");
    await db.execAsync("UPDATE video_registry SET watched_at = stored_at WHERE watched_at IS NULL");
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_video_watched ON video_registry(watched_at DESC)");
    await db.runAsync("UPDATE schema_version SET version = 10");
  }

  if (currentVersion < 11) {
    // Preserve existing local data during this schema version.
    await db.runAsync("UPDATE schema_version SET version = 11");
  }

  // ── v12: AfuAI long-term memory store ─────────────────────────────────────────
  if (currentVersion < 12) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ai_memories (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_memories_updated ON ai_memories(updated_at DESC);
    `);
    await db.runAsync("UPDATE schema_version SET version = 12");
  }

  // ── v13: Author metadata on video_registry for offline feed display ────────────
  if (currentVersion < 13) {
    await execSchemaChange(db, "ALTER TABLE video_registry ADD COLUMN author_id TEXT");
    await execSchemaChange(db, "ALTER TABLE video_registry ADD COLUMN author_handle TEXT");
    await execSchemaChange(db, "ALTER TABLE video_registry ADD COLUMN author_name TEXT");
    await execSchemaChange(db, "ALTER TABLE video_registry ADD COLUMN author_avatar TEXT");
    await db.runAsync("UPDATE schema_version SET version = 13");
  }

  // ── v14: remove an obsolete local cache ────────────────────────────────────
  if (currentVersion < 14) {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_notif_created;
      DROP INDEX IF EXISTS idx_notif_unread;
      DROP TABLE IF EXISTS notifications;
    `);
    await db.runAsync("UPDATE schema_version SET version = 14");
  }

  // ── v15: remove obsolete preference columns from local settings ────────────
  if (currentVersion < 15) {
    for (const column of [
      "notif_likes", "notif_comments", "notif_follows", "notif_messages",
      "notif_mentions", "notif_reposts", "notif_tips", "notif_system",
      "notif_stories", "notif_live",
    ]) {
      await execSchemaChange(db, `ALTER TABLE user_settings DROP COLUMN ${column}`);
    }
    await db.runAsync("UPDATE schema_version SET version = 15");
  }

  // ── v16: exact device phonebook cache for offline contact picking ─────────
  if (currentVersion < 16) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS phonebook_contacts (
        contact_key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        normalized_phone TEXT NOT NULL,
        position INTEGER NOT NULL,
        phone_index INTEGER NOT NULL,
        matched_user_id TEXT,
        matched_display_name TEXT,
        matched_handle TEXT,
        matched_avatar_url TEXT,
        matched_bio TEXT,
        matched_acoin INTEGER NOT NULL DEFAULT 0,
        matched_is_verified INTEGER NOT NULL DEFAULT 0,
        matched_is_organization_verified INTEGER NOT NULL DEFAULT 0,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_phonebook_contacts_order
        ON phonebook_contacts(position, phone_index);
      CREATE INDEX IF NOT EXISTS idx_phonebook_contacts_normalized
        ON phonebook_contacts(normalized_phone);
    `);
    await db.runAsync("UPDATE schema_version SET version = 16");
  }

  if (currentVersion < 17) {
    await execSchemaChange(db, "ALTER TABLE conversations ADD COLUMN created_by TEXT");
    await db.runAsync("UPDATE schema_version SET version = 17");
  }

  if (currentVersion < 18) {
    await execSchemaChange(db, "ALTER TABLE messages ADD COLUMN sender_display_name TEXT");
    await execSchemaChange(db, "ALTER TABLE messages ADD COLUMN sender_avatar_url TEXT");
    await execSchemaChange(db, "ALTER TABLE messages ADD COLUMN sender_handle TEXT");
    await db.runAsync("UPDATE schema_version SET version = 18");
  }

  if (currentVersion < 19) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS discover_people (
        user_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        position INTEGER NOT NULL,
        stored_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, person_id)
      );
      CREATE INDEX IF NOT EXISTS idx_discover_people_owner_position
        ON discover_people(user_id, position);
    `);
    await db.runAsync("UPDATE schema_version SET version = 19");
  }

  if (currentVersion < 20) {
    await execSchemaChange(db, "ALTER TABLE messages ADD COLUMN delivered_at TEXT");
    await execSchemaChange(db, "ALTER TABLE messages ADD COLUMN read_at TEXT");
    await db.runAsync("UPDATE schema_version SET version = 20");
  }

  // v21: a post may belong to both For You and Following. Keep one lightweight
  // record per (post, tab), so trimming one offline feed never evicts the other.
  if (currentVersion < 21) {
    await db.execAsync("BEGIN IMMEDIATE");
    try {
      await db.execAsync(`
        CREATE TABLE feed_posts_v21 (
          id TEXT NOT NULL, author_id TEXT NOT NULL, content TEXT, image_url TEXT,
          images TEXT, video_url TEXT, post_type TEXT, article_title TEXT,
          created_at TEXT NOT NULL, like_count INTEGER NOT NULL DEFAULT 0,
          reply_count INTEGER NOT NULL DEFAULT 0, view_count INTEGER NOT NULL DEFAULT 0,
          liked INTEGER NOT NULL DEFAULT 0, bookmarked INTEGER NOT NULL DEFAULT 0,
          author_name TEXT, author_handle TEXT, author_avatar TEXT,
          is_verified INTEGER NOT NULL DEFAULT 0, is_org_verified INTEGER NOT NULL DEFAULT 0,
          tab TEXT NOT NULL DEFAULT 'for_you', score REAL NOT NULL DEFAULT 0,
          stored_at INTEGER NOT NULL, viewed_at INTEGER, saved_to_tab TEXT,
          PRIMARY KEY (id, tab)
        );
        INSERT OR IGNORE INTO feed_posts_v21
          (id, author_id, content, image_url, images, video_url, post_type, article_title,
           created_at, like_count, reply_count, view_count, liked, bookmarked,
           author_name, author_handle, author_avatar, is_verified, is_org_verified,
           tab, score, stored_at, viewed_at, saved_to_tab)
        SELECT id, author_id, content, image_url, images, video_url, post_type, article_title,
               created_at, like_count, reply_count, view_count, liked, bookmarked,
               author_name, author_handle, author_avatar, is_verified, is_org_verified,
               tab, score, stored_at, viewed_at, saved_to_tab
        FROM feed_posts;
        DROP TABLE feed_posts;
        ALTER TABLE feed_posts_v21 RENAME TO feed_posts;
        CREATE INDEX idx_feed_tab_created ON feed_posts(tab, created_at DESC);
        CREATE INDEX idx_feed_created ON feed_posts(created_at DESC);
      `);
      await db.runAsync("UPDATE schema_version SET version = 21");
      await db.execAsync("COMMIT");
    } catch (error) {
      try { await db.execAsync("ROLLBACK"); } catch {}
      throw error;
    }
  }
}
