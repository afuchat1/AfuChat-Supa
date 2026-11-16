BEGIN;

CREATE TABLE IF NOT EXISTS public.user_achievement_rewards (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  xp_amount integer NOT NULL CHECK (xp_amount > 0),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE public.user_achievement_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own achievement rewards"
  ON public.user_achievement_rewards;
CREATE POLICY "Users can view own achievement rewards"
  ON public.user_achievement_rewards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_achievement_rewards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_achievement_rewards TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_achievement_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_posts integer := 0;
  v_stories integer := 0;
  v_messages integer := 0;
  v_xp integer := 0;
  v_level integer := 1;
  v_batch_xp integer := 0;
  v_total_xp integer := 0;
  v_inserted_xp integer;
  v_reward record;
  v_rewarded_ids text[] := ARRAY[]::text[];
  v_iterations integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Serialize concurrent claims for the same account.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':achievement_rewards', 0)
  );

  SELECT profile.*
    INTO v_profile
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_not_found');
  END IF;

  SELECT count(*)::integer
    INTO v_posts
  FROM public.posts AS post
  WHERE post.author_id = v_user_id;

  SELECT count(*)::integer
    INTO v_stories
  FROM public.stories AS story
  WHERE story.user_id = v_user_id;

  SELECT count(*)::integer
    INTO v_messages
  FROM public.messages AS message
  WHERE message.sender_id = v_user_id;

  v_xp := COALESCE(v_profile.xp, 0);

  -- Re-evaluate XP and level achievements after each batch, so XP earned
  -- from one achievement can correctly qualify the user for another.
  LOOP
    v_iterations := v_iterations + 1;
    IF v_iterations > 40 THEN
      RAISE EXCEPTION 'Achievement reward cascade exceeded its safety limit';
    END IF;

    v_level := floor(sqrt(GREATEST(v_xp, 0)::numeric / 100))::integer + 1;
    v_batch_xp := 0;

    FOR v_reward IN
      SELECT candidate.achievement_id, candidate.xp_amount
      FROM (
        VALUES
          ('welcome',       0,     true),
          ('profile_done',  100,   COALESCE(v_profile.onboarding_completed, false)),
          ('phone_linked',  50,    NULLIF(btrim(COALESCE(v_profile.phone_number, '')), '') IS NOT NULL),
          ('set_country',   50,    NULLIF(btrim(COALESCE(v_profile.country, '')), '') IS NOT NULL),
          ('interests',     100,   COALESCE(array_length(v_profile.interests, 1), 0) >= 5),
          ('xp_1k',         100,   v_xp >= 1000),
          ('xp_5k',         300,   v_xp >= 5000),
          ('xp_10k',        500,   v_xp >= 10000),
          ('xp_25k',        1000,  v_xp >= 25000),
          ('xp_50k',        2000,  v_xp >= 50000),
          ('xp_100k',       5000,  v_xp >= 100000),
          ('lvl_10',        200,   v_level >= 10),
          ('lvl_25',        500,   v_level >= 25),
          ('lvl_50',        2000,  v_level >= 50),
          ('lvl_100',       10000, v_level >= 100),
          ('first_post',    50,    v_posts >= 1),
          ('posts_10',      200,   v_posts >= 10),
          ('posts_50',      500,   v_posts >= 50),
          ('posts_100',     1000,  v_posts >= 100),
          ('posts_500',     3000,  v_posts >= 500),
          ('first_story',   50,    v_stories >= 1),
          ('stories_20',    300,   v_stories >= 20),
          ('stories_100',   1000,  v_stories >= 100),
          ('msg_1',         50,    v_messages >= 1),
          ('msg_50',        100,   v_messages >= 50),
          ('msg_500',       300,   v_messages >= 500),
          ('msg_2k',        1000,  v_messages >= 2000),
          ('msg_10k',       5000,  v_messages >= 10000),
          ('coins_1',       50,    COALESCE(v_profile.acoin, 0) >= 1),
          ('coins_500',     100,   COALESCE(v_profile.acoin, 0) >= 500),
          ('coins_1k',      300,   COALESCE(v_profile.acoin, 0) >= 1000),
          ('coins_5k',      500,   COALESCE(v_profile.acoin, 0) >= 5000),
          ('coins_10k',     1000,  COALESCE(v_profile.acoin, 0) >= 10000),
          ('coins_50k',     3000,  COALESCE(v_profile.acoin, 0) >= 50000),
          ('premium',       1000,  EXISTS (
            SELECT 1
            FROM public.user_subscriptions AS subscription
            JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
            WHERE subscription.user_id = v_user_id
              AND subscription.is_active = true
              AND subscription.expires_at > now()
              AND plan.tier <> 'free'
          )),
          ('grade_gold',    2000,  COALESCE(v_profile.current_grade, '') IN ('gold', 'platinum')),
          ('platinum',      5000,  COALESCE(v_profile.current_grade, '') = 'platinum'),
          ('verified',      500,   COALESCE(v_profile.is_verified, false)),
          ('org_verified',  3000,  COALESCE(v_profile.is_organization_verified, false)),
          ('biz_mode',      500,   COALESCE(v_profile.is_business_mode, false)),
          ('early_bird',    5000,  false),
          ('support',       5000,  COALESCE(v_profile.is_support_staff, false)),
          ('admin',         10000, COALESCE(v_profile.is_admin, false))
      ) AS candidate(achievement_id, xp_amount, is_eligible)
      WHERE candidate.is_eligible
        AND candidate.xp_amount > 0
      ORDER BY candidate.achievement_id
    LOOP
      INSERT INTO public.user_achievement_rewards (user_id, achievement_id, xp_amount)
      VALUES (v_user_id, v_reward.achievement_id, v_reward.xp_amount)
      ON CONFLICT (user_id, achievement_id) DO NOTHING
      RETURNING xp_amount INTO v_inserted_xp;

      IF FOUND THEN
        v_batch_xp := v_batch_xp + v_inserted_xp;

        INSERT INTO public.xp_activity_log (user_id, activity_type, xp_amount, metadata)
        VALUES (
          v_user_id,
          'achievement_reward',
          v_inserted_xp,
          jsonb_build_object('achievement_id', v_reward.achievement_id)
        );
      END IF;
    END LOOP;

    EXIT WHEN v_batch_xp = 0;

    UPDATE public.profiles
    SET xp = COALESCE(xp, 0) + v_batch_xp
    WHERE id = v_user_id
    RETURNING xp INTO v_xp;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile disappeared while applying achievement rewards';
    END IF;

    v_total_xp := v_total_xp + v_batch_xp;
  END LOOP;

  SELECT COALESCE(
    array_agg(reward.achievement_id ORDER BY reward.achievement_id),
    ARRAY[]::text[]
  )
  INTO v_rewarded_ids
  FROM public.user_achievement_rewards AS reward
  WHERE reward.user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'xp_awarded', v_total_xp,
    'new_balance', v_xp,
    'rewarded_achievement_ids', v_rewarded_ids
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_achievement_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_achievement_rewards() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
