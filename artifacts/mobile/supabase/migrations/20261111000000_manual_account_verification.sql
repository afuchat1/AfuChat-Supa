-- Personal verification is earned through sustained, public participation and
-- reviewed by an AfuChat administrator. Eligibility and submission are checked
-- in SECURITY DEFINER functions so clients cannot bypass the requirements.

CREATE TABLE IF NOT EXISTS public.manual_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'public_figure', 'journalist', 'public_official', 'activist', 'creator', 'other'
  )),
  statement text NOT NULL CHECK (char_length(btrim(statement)) BETWEEN 80 AND 600),
  evidence_url text NOT NULL CHECK (
    char_length(evidence_url) <= 500 AND evidence_url ~* '^https://'
  ),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_verification_requests_decision_note_length
    CHECK (decision_note IS NULL OR char_length(decision_note) <= 500)
);

CREATE INDEX IF NOT EXISTS manual_verification_requests_user_created_idx
  ON public.manual_verification_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS manual_verification_requests_pending_idx
  ON public.manual_verification_requests (created_at ASC)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS manual_verification_requests_one_pending_per_user
  ON public.manual_verification_requests (user_id)
  WHERE status = 'pending';

ALTER TABLE public.manual_verification_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manual_verification_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.manual_verification_requests TO authenticated;

DROP POLICY IF EXISTS "Users and admins can view manual verification requests"
  ON public.manual_verification_requests;
CREATE POLICY "Users and admins can view manual verification requests"
  ON public.manual_verification_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles AS viewer
      WHERE viewer.id = auth.uid() AND viewer.is_admin = true
    )
  );

CREATE OR REPLACE FUNCTION public.get_my_manual_verification_eligibility()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_email_verified boolean := false;
  v_has_paid_verification boolean := false;
  v_account_days integer := 0;
  v_public_posts integer := 0;
  v_active_weeks integer := 0;
  v_profile_complete boolean := false;
  v_age_ok boolean := false;
  v_public_profile_ok boolean := false;
  v_posts_ok boolean := false;
  v_good_standing boolean := false;
  v_cooldown_ok boolean := true;
  v_latest_status text;
  v_latest_created_at timestamptz;
  v_latest_note text;
  v_reapply_at timestamptz;
  v_already_verified boolean := false;
  v_pending boolean := false;
  v_eligible boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    profile.created_at,
    profile.display_name,
    profile.handle,
    profile.avatar_url,
    profile.bio,
    coalesce(profile.is_private, false) AS is_private,
    coalesce(profile.is_banned, false) AS is_banned,
    coalesce(profile.is_verified, false) AS is_verified
  INTO v_profile
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT user_record.email_confirmed_at IS NOT NULL
  INTO v_email_verified
  FROM auth.users AS user_record
  WHERE user_record.id = v_user_id;
  v_email_verified := coalesce(v_email_verified, false);

  v_account_days := greatest(
    0,
    floor(extract(epoch FROM (now() - coalesce(v_profile.created_at, now()))) / 86400)::integer
  );
  v_age_ok := v_account_days >= 90;
  v_public_profile_ok := NOT v_profile.is_private;
  v_profile_complete :=
    nullif(btrim(coalesce(v_profile.display_name, '')), '') IS NOT NULL
    AND nullif(btrim(coalesce(v_profile.handle, '')), '') IS NOT NULL
    AND nullif(btrim(coalesce(v_profile.avatar_url, '')), '') IS NOT NULL
    AND char_length(btrim(coalesce(v_profile.bio, ''))) >= 40;
  v_good_standing := NOT v_profile.is_banned;

  SELECT
    count(*)::integer,
    count(DISTINCT date_trunc('week', post.created_at))::integer
  INTO v_public_posts, v_active_weeks
  FROM public.posts AS post
  WHERE post.author_id = v_user_id
    AND post.visibility = 'public'
    AND coalesce(post.is_blocked, false) = false
    AND post.created_at >= now() - interval '90 days';
  v_posts_ok := v_public_posts >= 10 AND v_active_weeks >= 6;

  SELECT
    request.status,
    request.created_at,
    request.decision_note
  INTO v_latest_status, v_latest_created_at, v_latest_note
  FROM public.manual_verification_requests AS request
  WHERE request.user_id = v_user_id
  ORDER BY request.created_at DESC
  LIMIT 1;

  v_pending := v_latest_status = 'pending';
  IF v_latest_status = 'rejected' AND v_latest_created_at IS NOT NULL THEN
    v_reapply_at := v_latest_created_at + interval '90 days';
    v_cooldown_ok := v_reapply_at <= now();
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_subscriptions AS subscription
    JOIN public.subscription_plans AS plan ON plan.id = subscription.plan_id
    WHERE subscription.user_id = v_user_id
      AND subscription.is_active = true
      AND subscription.expires_at > now()
      AND plan.grants_verification = true
  )
  INTO v_has_paid_verification;

  v_already_verified := v_profile.is_verified OR v_has_paid_verification;
  v_eligible :=
    v_age_ok
    AND v_email_verified
    AND v_public_profile_ok
    AND v_profile_complete
    AND v_posts_ok
    AND v_good_standing
    AND v_cooldown_ok
    AND NOT v_pending
    AND NOT v_already_verified;

  RETURN jsonb_build_object(
    'ok', true,
    'eligible', v_eligible,
    'already_verified', v_already_verified,
    'pending', v_pending,
    'latest_request', CASE
      WHEN v_latest_status IS NULL THEN NULL
      ELSE jsonb_build_object(
        'status', v_latest_status,
        'created_at', v_latest_created_at,
        'decision_note', v_latest_note,
        'reapply_at', v_reapply_at
      )
    END,
    'requirements', jsonb_build_array(
      jsonb_build_object('key', 'account_age', 'passed', v_age_ok, 'current', v_account_days, 'target', 90),
      jsonb_build_object('key', 'email_verified', 'passed', v_email_verified),
      jsonb_build_object('key', 'public_profile', 'passed', v_public_profile_ok),
      jsonb_build_object('key', 'complete_profile', 'passed', v_profile_complete),
      jsonb_build_object(
        'key', 'sustained_activity',
        'passed', v_posts_ok,
        'posts', v_public_posts,
        'posts_target', 10,
        'active_weeks', v_active_weeks,
        'weeks_target', 6
      ),
      jsonb_build_object('key', 'good_standing', 'passed', v_good_standing),
      jsonb_build_object('key', 'reapply_window', 'passed', v_cooldown_ok, 'reapply_at', v_reapply_at)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_manual_verification_eligibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_manual_verification_eligibility() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_manual_verification_request(
  p_category text,
  p_statement text,
  p_evidence_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_eligibility jsonb;
  v_request_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_category NOT IN ('public_figure', 'journalist', 'public_official', 'activist', 'creator', 'other') THEN
    RAISE EXCEPTION 'Choose a valid verification category';
  END IF;
  IF p_statement IS NULL OR char_length(btrim(p_statement)) NOT BETWEEN 80 AND 600 THEN
    RAISE EXCEPTION 'The statement must be between 80 and 600 characters';
  END IF;
  IF p_evidence_url IS NULL
    OR char_length(p_evidence_url) > 500
    OR p_evidence_url !~* '^https://'
  THEN
    RAISE EXCEPTION 'Provide a public HTTPS evidence link';
  END IF;

  v_eligibility := public.get_my_manual_verification_eligibility();
  IF NOT coalesce((v_eligibility->>'eligible')::boolean, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_eligible',
      'eligibility', v_eligibility
    );
  END IF;

  INSERT INTO public.manual_verification_requests (
    user_id, category, statement, evidence_url
  )
  VALUES (
    v_user_id, p_category, btrim(p_statement), btrim(p_evidence_url)
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'status', 'pending');
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_already_pending');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_manual_verification_request(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_manual_verification_request(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pending_manual_verification_requests()
RETURNS TABLE (
  request_id uuid,
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  category text,
  statement text,
  evidence_url text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS viewer
    WHERE viewer.id = auth.uid() AND viewer.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN QUERY
  SELECT
    request.id,
    request.user_id,
    profile.handle,
    profile.display_name,
    profile.avatar_url,
    request.category,
    request.statement,
    request.evidence_url,
    request.created_at
  FROM public.manual_verification_requests AS request
  JOIN public.profiles AS profile ON profile.id = request.user_id
  WHERE request.status = 'pending'
  ORDER BY request.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_pending_manual_verification_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_manual_verification_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_manual_verification_request(
  p_request_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS reviewer
    WHERE reviewer.id = auth.uid() AND reviewer.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 500 THEN
    RAISE EXCEPTION 'Review note must be 500 characters or fewer';
  END IF;

  SELECT request.user_id, request.status
  INTO v_user_id, v_status
  FROM public.manual_verification_requests AS request
  WHERE request.id = p_request_id
  FOR UPDATE;

  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This request is no longer pending';
  END IF;

  UPDATE public.manual_verification_requests
  SET status = p_decision,
      decision_note = nullif(btrim(p_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;

  IF p_decision = 'approved' THEN
    UPDATE public.profiles
    SET is_verified = true
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p_decision);
END;
$$;

REVOKE ALL ON FUNCTION public.review_manual_verification_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_manual_verification_request(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
