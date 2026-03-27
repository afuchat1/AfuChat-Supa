-- Add theme preference and recent searches to existing settings table
ALTER TABLE advanced_feature_settings
  ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS recent_searches JSONB DEFAULT '[]'::jsonb;

-- Chat drafts table (cross-device draft persistence)
CREATE TABLE IF NOT EXISTS chat_drafts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id)
);

ALTER TABLE chat_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_drafts_own" ON chat_drafts;
CREATE POLICY "chat_drafts_own" ON chat_drafts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
