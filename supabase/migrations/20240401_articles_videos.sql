-- Add article and video post types to posts table
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS article_title TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_post_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_post_type_check CHECK (post_type IN ('post', 'article', 'video'));

CREATE INDEX IF NOT EXISTS idx_posts_video_feed
  ON public.posts (created_at DESC)
  WHERE post_type = 'video' AND visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_posts_article_feed
  ON public.posts (created_at DESC)
  WHERE post_type = 'article' AND visibility = 'public';

-- Storage bucket for short videos (run in Supabase SQL editor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos', 'videos', true, 209715200,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/mpeg']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Videos are publicly accessible" ON storage.objects;
CREATE POLICY "Videos are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
CREATE POLICY "Authenticated users can upload videos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'videos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
CREATE POLICY "Users can delete own videos" ON storage.objects
  FOR DELETE USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
