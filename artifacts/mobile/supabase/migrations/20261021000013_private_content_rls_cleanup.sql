-- Remove legacy unconditional read policies that bypassed profile privacy.
DROP POLICY IF EXISTS "Authenticated users can read posts" ON public.posts;
DROP POLICY IF EXISTS "Public and Auth read posts" ON public.posts;
DROP POLICY IF EXISTS "Public posts are viewable by everyone" ON public.posts;

-- A wall post is visible to the wall owner, its author, followers of the
-- wall owner, or everyone when the wall owner's profile is public.
DROP POLICY IF EXISTS "Users can view posts on their wall" ON public.posts;
CREATE POLICY "Users can view posts on their wall"
ON public.posts FOR SELECT TO PUBLIC
USING (
  wall_user_id = (SELECT auth.uid())
  OR author_id = (SELECT auth.uid())
  OR (
    wall_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles wall_profile
      WHERE wall_profile.id = posts.wall_user_id
        AND wall_profile.is_private = false
    )
  )
  OR (
    wall_user_id IS NOT NULL
    AND (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.following_id = posts.wall_user_id
        AND f.follower_id = (SELECT auth.uid())
    )
  )
);

-- Replies inherit post/profile privacy; reply authors and post authors can
-- still see their own relevant replies.
DROP POLICY IF EXISTS "Authenticated users can read post replies" ON public.post_replies;
DROP POLICY IF EXISTS "Public replies are viewable by everyone" ON public.post_replies;
DROP POLICY IF EXISTS "Anyone can view replies on public posts" ON public.post_replies;
CREATE POLICY "Anyone can view replies on public posts"
ON public.post_replies FOR SELECT TO PUBLIC
USING (
  EXISTS (
    SELECT 1
    FROM public.posts p
    JOIN public.profiles author_profile ON author_profile.id = p.author_id
    WHERE p.id = post_replies.post_id
      AND author_profile.is_private = false
  )
  OR (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.posts p
      JOIN public.follows f ON f.following_id = p.author_id
      WHERE p.id = post_replies.post_id
        AND f.follower_id = (SELECT auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_replies.post_id
      AND p.author_id = (SELECT auth.uid())
  )
  OR post_replies.author_id = (SELECT auth.uid())
);

NOTIFY pgrst, 'reload schema';