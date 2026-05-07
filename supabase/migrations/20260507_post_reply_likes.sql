-- post_reply_likes: persists like/heart reactions on comments (post_replies).
-- Uses optimistic UI on the client side; this table is the source of truth.

CREATE TABLE IF NOT EXISTS post_reply_likes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reply_id   uuid NOT NULL REFERENCES post_replies(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (reply_id, user_id)
);

ALTER TABLE post_reply_likes ENABLE ROW LEVEL SECURITY;

-- Anyone can read likes (public post replies are public)
CREATE POLICY "Anyone can read reply likes"
  ON post_reply_likes FOR SELECT USING (true);

-- Users can only insert/delete their own likes
CREATE POLICY "Users manage their own reply likes"
  ON post_reply_likes FOR ALL USING (auth.uid() = user_id);

-- Fast look-ups by reply_id and by user_id
CREATE INDEX IF NOT EXISTS post_reply_likes_reply_idx ON post_reply_likes (reply_id);
CREATE INDEX IF NOT EXISTS post_reply_likes_user_idx  ON post_reply_likes (user_id);
