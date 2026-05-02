-- Add duet support to posts table
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS duet_of_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;

-- Update post_type constraint to allow 'duet'
ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_post_type_check;

ALTER TABLE posts
  ADD CONSTRAINT posts_post_type_check
  CHECK (post_type IN ('post', 'article', 'video', 'duet'));

-- Index for looking up duets of a given post
CREATE INDEX IF NOT EXISTS posts_duet_of_post_id_idx ON posts(duet_of_post_id)
  WHERE duet_of_post_id IS NOT NULL;
