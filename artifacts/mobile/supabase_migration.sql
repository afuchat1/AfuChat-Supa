-- ============================================================
-- AfuChat — Complete Database Migration
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ALTER profiles — add missing columns used by the app
-- ────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS follower_count   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count  INTEGER DEFAULT 0;

-- Keep follower_count in sync with the follows table
CREATE OR REPLACE FUNCTION update_follower_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET follower_count  = follower_count  + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET follower_count  = GREATEST(0, follower_count  - 1) WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follower_counts ON follows;
CREATE TRIGGER trg_follower_counts
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follower_counts();

-- Backfill current counts
UPDATE profiles p SET
  follower_count  = (SELECT COUNT(*) FROM follows WHERE following_id = p.id),
  following_count = (SELECT COUNT(*) FROM follows WHERE follower_id  = p.id);


-- ────────────────────────────────────────────────────────────
-- 2. post_bookmarks (Saved Posts)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_bookmarks (
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE post_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bookmarks" ON post_bookmarks
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 3. group_chats (Group Chat)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_chats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  avatar_url   TEXT,
  creator_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  member_count INTEGER DEFAULT 0,
  is_public    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE group_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read group chats" ON group_chats FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated can create group chats" ON group_chats FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE TABLE IF NOT EXISTS group_chat_members (
  group_id   UUID REFERENCES group_chats(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role       TEXT DEFAULT 'member' CHECK (role IN ('owner','admin','moderator','member')),
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
ALTER TABLE group_chat_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read group members" ON group_chat_members FOR SELECT USING (TRUE);
CREATE POLICY "Users manage own membership" ON group_chat_members
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 4. achievements (Achievements)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  emoji       TEXT DEFAULT '🏆',
  xp_reward   INTEGER DEFAULT 0,
  acoin_reward INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read achievements" ON achievements FOR SELECT USING (TRUE);


-- ────────────────────────────────────────────────────────────
-- 5. channels (Channels / Broadcast)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  avatar_url   TEXT,
  owner_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_public    BOOLEAN DEFAULT TRUE,
  subscriber_count INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read public channels" ON channels FOR SELECT USING (is_public = TRUE OR owner_id = auth.uid());
CREATE POLICY "Owners manage channels" ON channels
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS channel_subscriptions (
  channel_id    UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);
ALTER TABLE channel_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage subscriptions" ON channel_subscriptions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 6. prestige_tiers (Prestige System)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prestige_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT UNIQUE NOT NULL,
  min_acoin       BIGINT NOT NULL,
  color           TEXT NOT NULL,
  emoji           TEXT NOT NULL,
  description     TEXT,
  perks           JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE prestige_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read prestige tiers" ON prestige_tiers FOR SELECT USING (TRUE);

INSERT INTO prestige_tiers (name, min_acoin, color, emoji, description) VALUES
  ('Bronze',   0,      '#CD7F32', '🥉', 'Starting tier for new members'),
  ('Silver',   500,    '#C0C0C0', '🥈', 'Consistent contributors'),
  ('Gold',     2000,   '#D4A853', '🥇', 'Dedicated community members'),
  ('Diamond',  10000,  '#B9F2FF', '💎', 'Elite community members'),
  ('Obsidian', 50000,  '#1C1C1E', '🔮', 'Legendary status achieved'),
  ('Legend',   200000, '#00BCD4', '👑', 'The highest honor in AfuChat')
ON CONFLICT (name) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 7. creator_monetize_settings (Monetize Hub)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_monetize_settings (
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL,
  enabled    BOOLEAN DEFAULT FALSE,
  price      INTEGER DEFAULT 50,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, feature_id)
);
ALTER TABLE creator_monetize_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read creator settings" ON creator_monetize_settings FOR SELECT USING (TRUE);
CREATE POLICY "Users manage own settings" ON creator_monetize_settings
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 8. paid_communities (Paid Communities)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paid_communities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  emoji        TEXT DEFAULT '🏰',
  price        INTEGER NOT NULL DEFAULT 100,
  member_count INTEGER DEFAULT 0,
  creator_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tags         TEXT[] DEFAULT '{}',
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE paid_communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active communities" ON paid_communities FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Authenticated can create communities" ON paid_communities FOR INSERT
  WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update own communities" ON paid_communities FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE TABLE IF NOT EXISTS community_members (
  community_id UUID REFERENCES paid_communities(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own community memberships" ON community_members
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can read memberships" ON community_members FOR SELECT USING (TRUE);


-- ────────────────────────────────────────────────────────────
-- 9. digital_events + event_tickets (Digital Events)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digital_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  emoji        TEXT DEFAULT '🎫',
  price        INTEGER NOT NULL DEFAULT 0,
  event_date   TIMESTAMPTZ NOT NULL,
  capacity     INTEGER DEFAULT 0,
  tickets_sold INTEGER DEFAULT 0,
  creator_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  category     TEXT DEFAULT 'Online',
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE digital_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active events" ON digital_events FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Authenticated can create events" ON digital_events FOR INSERT
  WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update own events" ON digital_events FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE TABLE IF NOT EXISTS event_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID REFERENCES digital_events(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);
ALTER TABLE event_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tickets" ON event_tickets
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Creators can read their event tickets" ON event_tickets FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = (SELECT creator_id FROM digital_events WHERE id = event_id));


-- ────────────────────────────────────────────────────────────
-- 10. freelance_listings + freelance_orders (Freelance Market)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freelance_listings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  emoji        TEXT DEFAULT '💼',
  price        INTEGER NOT NULL,
  delivery_days INTEGER DEFAULT 3,
  category     TEXT DEFAULT 'Other',
  seller_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_active    BOOLEAN DEFAULT TRUE,
  orders_count INTEGER DEFAULT 0,
  rating       NUMERIC(3,1) DEFAULT 5.0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE freelance_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active listings" ON freelance_listings FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Sellers can manage own listings" ON freelance_listings
  USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

CREATE TABLE IF NOT EXISTS freelance_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID REFERENCES freelance_listings(id) ON DELETE SET NULL,
  buyer_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  seller_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  price_paid  INTEGER NOT NULL,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','delivered','completed','disputed','cancelled')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE freelance_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers and sellers can read own orders" ON freelance_orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Buyers can create orders" ON freelance_orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);


-- ────────────────────────────────────────────────────────────
-- 11. username_listings (Username Marketplace)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS username_listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT NOT NULL,
  price       INTEGER NOT NULL,
  seller_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  views       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE username_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active username listings" ON username_listings FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Sellers manage own listings" ON username_listings
  USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);


-- ────────────────────────────────────────────────────────────
-- 12. collections + collection_items (Save to Collections)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  emoji       TEXT DEFAULT '📁',
  color       TEXT DEFAULT '#00BCD4',
  is_private  BOOLEAN DEFAULT FALSE,
  item_count  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own + public collections" ON collections FOR SELECT
  USING (auth.uid() = user_id OR is_private = FALSE);
CREATE POLICY "Users manage own collections" ON collections
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS collection_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL CHECK (item_type IN ('post','link','image','file')),
  item_id       TEXT,
  url           TEXT,
  title         TEXT,
  preview       TEXT,
  added_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Collection owner reads items" ON collection_items FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM collections WHERE id = collection_id));
CREATE POLICY "Collection owner manages items" ON collection_items
  USING (auth.uid() = (SELECT user_id FROM collections WHERE id = collection_id))
  WITH CHECK (auth.uid() = (SELECT user_id FROM collections WHERE id = collection_id));


-- ────────────────────────────────────────────────────────────
-- 13. pinned_media (File Manager — Pinned)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pinned_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  media_type   TEXT NOT NULL CHECK (media_type IN ('image','video','document','link','voice')),
  name         TEXT,
  file_size    BIGINT,
  sender_name  TEXT,
  chat_id      UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, url)
);
ALTER TABLE pinned_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pinned media" ON pinned_media
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 14. chat_media (File Manager — Shared Files)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url         TEXT NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('image','video','document','link','voice')),
  file_name   TEXT,
  file_size   BIGINT,
  sender_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  chat_id     UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE chat_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sender or receiver can read chat media" ON chat_media FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Sender can insert chat media" ON chat_media FOR INSERT
  WITH CHECK (auth.uid() = sender_id);


-- ────────────────────────────────────────────────────────────
-- 15. device_sessions (Device Security)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  device_name  TEXT NOT NULL,
  device_type  TEXT DEFAULT 'Phone',
  platform     TEXT DEFAULT 'ios',
  last_seen    TIMESTAMPTZ DEFAULT NOW(),
  ip_address   TEXT DEFAULT '—',
  location     TEXT,
  is_current   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own device sessions" ON device_sessions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 16. security_preferences (Device Security)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_preferences (
  user_id               UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  two_factor_enabled    BOOLEAN DEFAULT FALSE,
  login_alerts          BOOLEAN DEFAULT TRUE,
  require_pin           BOOLEAN DEFAULT FALSE,
  biometric_lock        BOOLEAN DEFAULT FALSE,
  screenshot_protection BOOLEAN DEFAULT FALSE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE security_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own security prefs" ON security_preferences
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 17. advanced_feature_settings (Advanced Features Hub)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS advanced_feature_settings (
  user_id                    UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  message_translation        BOOLEAN DEFAULT FALSE,
  translation_language       TEXT DEFAULT 'en',
  voice_to_text              BOOLEAN DEFAULT FALSE,
  text_to_speech             BOOLEAN DEFAULT FALSE,
  chat_summary               BOOLEAN DEFAULT FALSE,
  smart_notifications        BOOLEAN DEFAULT TRUE,
  chat_folders               BOOLEAN DEFAULT FALSE,
  offline_drafts             BOOLEAN DEFAULT TRUE,
  temp_chat_default_minutes  INTEGER DEFAULT 60,
  temp_chat_enabled          BOOLEAN DEFAULT FALSE,
  auto_reply_enabled         BOOLEAN DEFAULT FALSE,
  auto_reply_message         TEXT DEFAULT 'I''m currently unavailable. I''ll reply soon!',
  focus_mode                 BOOLEAN DEFAULT FALSE,
  focus_mode_schedule        BOOLEAN DEFAULT FALSE,
  activity_status            TEXT DEFAULT 'online',
  mini_profile_popup         BOOLEAN DEFAULT TRUE,
  show_typing_indicator      BOOLEAN DEFAULT TRUE,
  interactive_link_preview   BOOLEAN DEFAULT TRUE,
  link_to_mini_app           BOOLEAN DEFAULT FALSE,
  auto_media_organization    BOOLEAN DEFAULT TRUE,
  emoji_reactions_advanced   BOOLEAN DEFAULT TRUE,
  content_filter_topics      BOOLEAN DEFAULT FALSE,
  content_filter_keywords    TEXT DEFAULT '',
  message_reminders          BOOLEAN DEFAULT TRUE,
  keyword_alerts             BOOLEAN DEFAULT FALSE,
  keyword_alerts_list        TEXT DEFAULT '',
  chat_to_post               BOOLEAN DEFAULT TRUE,
  chat_export_format         TEXT DEFAULT 'pdf',
  quick_action_menu          BOOLEAN DEFAULT TRUE,
  split_screen_mode          BOOLEAN DEFAULT FALSE,
  cross_device_sync          BOOLEAN DEFAULT TRUE,
  group_roles_system         BOOLEAN DEFAULT FALSE,
  screen_share               BOOLEAN DEFAULT FALSE,
  drag_drop_upload           BOOLEAN DEFAULT TRUE,
  user_tagging               BOOLEAN DEFAULT TRUE,
  message_edit_history       BOOLEAN DEFAULT TRUE,
  in_app_browser             BOOLEAN DEFAULT TRUE,
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE advanced_feature_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own feature settings" ON advanced_feature_settings
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 18. Useful helper RPC: get or create a direct chat
--     Used by: freelance orders (open seller chat after order)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_or_create_direct_chat(other_user_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_chat_id UUID;
  v_me UUID := auth.uid();
BEGIN
  -- Look for existing 1-on-1 direct chat between the two users
  SELECT cm1.chat_id INTO v_chat_id
  FROM chat_members cm1
  JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id AND cm2.user_id = other_user_id
  JOIN chats c ON c.id = cm1.chat_id
    AND (c.is_group IS NULL OR c.is_group = FALSE)
    AND (c.is_channel IS NULL OR c.is_channel = FALSE)
  WHERE cm1.user_id = v_me
  LIMIT 1;

  IF v_chat_id IS NULL THEN
    INSERT INTO chats (is_group, is_channel, created_by)
    VALUES (FALSE, FALSE, v_me)
    RETURNING id INTO v_chat_id;

    INSERT INTO chat_members (chat_id, user_id)
    VALUES (v_chat_id, v_me), (v_chat_id, other_user_id);
  END IF;

  RETURN v_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_direct_chat TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 19. Mutual followers count helper
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_mutual_followers_count(user_a UUID, user_b UUID)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COUNT(*)::INTEGER
  FROM follows f1
  JOIN follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
  WHERE f1.follower_id = user_a
    AND f1.following_id != user_a
    AND f2.follower_id = user_b
    AND f2.following_id = user_b;
$$;
GRANT EXECUTE ON FUNCTION get_mutual_followers_count TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 20. Seller applications table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seller_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  website_url TEXT,
  phone_number TEXT NOT NULL,
  address TEXT NOT NULL,
  country TEXT NOT NULL,
  id_document_url TEXT,
  business_reg_url TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seller_apps_user_id_idx ON seller_applications(user_id);
CREATE INDEX IF NOT EXISTS seller_apps_status_idx ON seller_applications(status);
ALTER TABLE seller_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_apps_own ON seller_applications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY seller_apps_admin_read ON seller_applications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY seller_apps_admin_update ON seller_applications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
GRANT ALL ON seller_applications TO authenticated;


-- ────────────────────────────────────────────────────────────
-- Done! Summary of what was created:
-- ────────────────────────────────────────────────────────────
-- ALTER:  profiles (+ follower_count, following_count)
-- NEW:    post_bookmarks
-- NEW:    group_chats, group_chat_members
-- NEW:    achievements
-- NEW:    channels, channel_subscriptions
-- NEW:    prestige_tiers (with seed data)
-- NEW:    creator_monetize_settings
-- NEW:    paid_communities, community_members
-- NEW:    digital_events, event_tickets
-- NEW:    freelance_listings, freelance_orders
-- NEW:    username_listings
-- NEW:    collections, collection_items
-- NEW:    pinned_media
-- NEW:    chat_media
-- NEW:    device_sessions
-- NEW:    security_preferences
-- NEW:    advanced_feature_settings
-- NEW:    get_or_create_direct_chat() RPC
-- NEW:    get_mutual_followers_count() RPC
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- Subscription plans seed (run in Supabase SQL editor)
-- ============================================================
-- Silver plan
UPDATE subscription_plans SET
  features = ARRAY[
    'Verified Badge',
    'Ad-free experience',
    'Message Translation (AI)',
    'Voice to Text (AI)',
    'Smart Notifications (AI)',
    'Smart Chat Folders',
    'Temporary Chat Mode (auto-delete)',
    'Auto-Reply Mode',
    'Focus Mode',
    'Activity Status Control',
    'Auto Media Organisation',
    'Advanced Emoji Reactions',
    'Content Filter',
    'Message Reminders',
    'Message Edit History',
    'Chat to Post',
    'Pin 1 gift on profile',
    '1 red envelope claim per day',
    'Basic chat themes'
  ]
WHERE tier = 'silver';

-- Gold plan
UPDATE subscription_plans SET
  features = ARRAY[
    'All Silver features',
    'Chat Summary (AI)',
    'AI Post Analysis',
    'Scheduled Focus Mode',
    'Link to Mini App (Beta)',
    'Keyword Alerts',
    'Chat Export (PDF, TXT, JSON)',
    'Cross-Device Sync',
    'Split Screen Mode (Web)',
    'Screen Share in Chat (Web)',
    'Group Roles System',
    'Create Stories & Groups',
    'Pin 2 gifts on profile',
    '5 red envelope claims per day',
    'Custom chat themes'
  ]
WHERE tier = 'gold';

-- Platinum plan
UPDATE subscription_plans SET
  features = ARRAY[
    'All Gold features',
    'AfuAI Chat Assistant (enhanced)',
    'AI Chat Themes & Wallpapers',
    'Create Channels',
    'Create Red Envelopes',
    'Gift Marketplace access',
    'Unlimited red envelope claims',
    'Leaderboard privacy',
    'Priority support'
  ]
WHERE tier = 'platinum';

-- ─── Notifications: add reference columns (run 2026-03-30) ────────────────────
-- Allows notifications to link to any entity (orders, channels, etc.)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS reference_type TEXT;

-- Create index for faster notification lookups
CREATE INDEX IF NOT EXISTS notifications_reference_idx
  ON notifications (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- ─── Storage: ensure voice-messages bucket allows all audio MIME types ─────────
-- Run this if voice uploads fail with "mime type not supported"
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'voice-messages',
  'voice-messages',
  true,
  ARRAY[
    'audio/mp4', 'audio/webm', 'audio/mpeg', 'audio/ogg',
    'audio/wav', 'audio/aac', 'audio/x-caf', 'audio/x-m4a',
    'audio/3gpp', 'audio/amr'
  ],
  52428800
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  allowed_mime_types = ARRAY[
    'audio/mp4', 'audio/webm', 'audio/mpeg', 'audio/ogg',
    'audio/wav', 'audio/aac', 'audio/x-caf', 'audio/x-m4a',
    'audio/3gpp', 'audio/amr'
  ],
  file_size_limit = 52428800;
