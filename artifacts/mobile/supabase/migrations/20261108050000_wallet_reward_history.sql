BEGIN;

-- Preserve the existing RPC signature while serializing same-user activity
-- rewards, so concurrent retries cannot both pass the cooldown check.
CREATE OR REPLACE FUNCTION public.reward_activity_xp(
  p_activity_type text,
  p_xp_amount integer,
  p_cooldown_seconds integer DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_balance integer;
  v_last_at timestamptz;
  v_cooldown_seconds integer := COALESCE(p_cooldown_seconds, 0);
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  IF p_activity_type IS NULL OR btrim(p_activity_type) = ''
     OR p_xp_amount IS NULL OR p_xp_amount <= 0 OR p_xp_amount > 1000
     OR v_cooldown_seconds < 0
  THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_reward');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_activity_type, 0)
  );

  -- Profile completion is a one-time reward even when an older client passes
  -- a zero cooldown.
  IF p_activity_type = 'profile_completed' AND EXISTS (
    SELECT 1
    FROM public.xp_activity_log
    WHERE user_id = v_user_id
      AND activity_type = p_activity_type
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_rewarded');
  END IF;

  IF v_cooldown_seconds > 0 THEN
    SELECT max(created_at)
      INTO v_last_at
    FROM public.xp_activity_log
    WHERE user_id = v_user_id
      AND activity_type = p_activity_type;

    IF v_last_at IS NOT NULL
       AND extract(epoch FROM (clock_timestamp() - v_last_at)) < v_cooldown_seconds
    THEN
      RETURN jsonb_build_object('success', false, 'reason', 'cooldown_active');
    END IF;
  END IF;

  UPDATE public.profiles
  SET xp = COALESCE(xp, 0) + p_xp_amount
  WHERE id = v_user_id
  RETURNING xp INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'profile_not_found');
  END IF;

  INSERT INTO public.xp_activity_log (user_id, activity_type, xp_amount, metadata)
  VALUES (v_user_id, p_activity_type, p_xp_amount, COALESCE(p_metadata, '{}'::jsonb));

  RETURN jsonb_build_object(
    'success', true,
    'xp_earned', p_xp_amount,
    'new_balance', v_new_balance
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reward_activity_xp(text, integer, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reward_activity_xp(text, integer, integer, jsonb) TO authenticated;

-- These are wallet-history sources; publish them so open wallet screens update
-- immediately when a reward or music transaction is inserted.
ALTER PUBLICATION supabase_realtime
  ADD TABLE public.xp_activity_log, public.music_transactions;

NOTIFY pgrst, 'reload schema';

COMMIT;
