-- Enforce the post audience setting in addition to profile privacy.
DROP POLICY IF EXISTS "Anyone can view public posts" ON public.posts;
CREATE POLICY "Anyone can view public posts"
ON public.posts FOR SELECT TO PUBLIC
USING (
  author_id = (SELECT auth.uid())
  OR (
    COALESCE(visibility, 'public') = 'public'
    AND EXISTS (
      SELECT 1 FROM public.profiles author_profile
      WHERE author_profile.id = posts.author_id
        AND author_profile.is_private = false
    )
  )
  OR (
    (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(visibility, 'public') IN ('public', 'followers')
    AND EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.following_id = posts.author_id
        AND f.follower_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can view posts on their wall" ON public.posts;
CREATE POLICY "Users can view posts on their wall"
ON public.posts FOR SELECT TO PUBLIC
USING (
  wall_user_id = (SELECT auth.uid())
  OR author_id = (SELECT auth.uid())
  OR (
    wall_user_id IS NOT NULL
    AND COALESCE(visibility, 'public') = 'public'
    AND EXISTS (
      SELECT 1 FROM public.profiles wall_profile
      WHERE wall_profile.id = posts.wall_user_id
        AND wall_profile.is_private = false
    )
  )
  OR (
    wall_user_id IS NOT NULL
    AND (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(visibility, 'public') IN ('public', 'followers')
    AND EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.following_id = posts.wall_user_id
        AND f.follower_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Anyone can view replies on public posts" ON public.post_replies;
CREATE POLICY "Anyone can view replies on public posts"
ON public.post_replies FOR SELECT TO PUBLIC
USING (
  post_replies.author_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.posts p
    JOIN public.profiles author_profile ON author_profile.id = p.author_id
    WHERE p.id = post_replies.post_id
      AND (
        p.author_id = (SELECT auth.uid())
        OR (
          COALESCE(p.visibility, 'public') = 'public'
          AND author_profile.is_private = false
        )
        OR (
          (SELECT auth.uid()) IS NOT NULL
          AND COALESCE(p.visibility, 'public') IN ('public', 'followers')
          AND EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.following_id = p.author_id
              AND f.follower_id = (SELECT auth.uid())
          )
        )
      )
  )
);

NOTIFY pgrst, 'reload schema';