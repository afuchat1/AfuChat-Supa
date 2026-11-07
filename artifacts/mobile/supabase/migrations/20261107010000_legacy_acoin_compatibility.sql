CREATE TABLE IF NOT EXISTS public.acoin_legacy_credit_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes')
);

CREATE INDEX IF NOT EXISTS acoin_legacy_credit_intents_lookup_idx
  ON public.acoin_legacy_credit_intents (sender_id, amount, expires_at);

ALTER TABLE public.acoin_legacy_credit_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.acoin_legacy_credit_intents FROM PUBLIC, anon, authenticated, service_role, afuchat_api;

COMMENT ON TABLE public.acoin_legacy_credit_intents IS
  'Short-lived one-use debit authorizations for legacy deduct_acoin then credit_acoin calls; clients cannot access this table directly.';

CREATE OR REPLACE FUNCTION public.deduct_acoin(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_current_acoin integer;
  v_context text := lower(COALESCE(current_query(), ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', 'You can only debit your own wallet');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Amount must be greater than zero');
  END IF;

  SELECT acoin
  INTO v_current_acoin
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_current_acoin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;
  IF v_current_acoin < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient ACoins',
      'current_acoin', v_current_acoin,
      'required', p_amount
    );
  END IF;

  UPDATE public.profiles
  SET acoin = acoin - p_amount
  WHERE id = auth.uid();

  -- Old clients call this RPC directly before credit_acoin. Internal
  -- purchase/auction functions have a different outer query and do not
  -- create a client compatibility intent.
  IF auth.role() = 'authenticated' AND v_context LIKE '%deduct_acoin%' THEN
    DELETE FROM public.acoin_legacy_credit_intents
    WHERE sender_id = auth.uid()
      AND expires_at <= now();

    INSERT INTO public.acoin_legacy_credit_intents (sender_id, amount)
    VALUES (auth.uid(), p_amount);
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_current_acoin - p_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.credit_acoin(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_sender_id uuid := auth.uid();
  v_role text := COALESCE(NULLIF(auth.role(), ''), session_user::text);
  v_context text := lower(
    COALESCE(current_query(), '') || ' ' ||
    COALESCE(current_setting('request.path', true), '')
  );
  v_intent_id uuid;
  v_updated_user_id uuid;
  v_internal_function_call boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Recipient wallet not found';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF v_role = 'authenticated' THEN
    IF v_sender_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- These SECURITY DEFINER RPCs already validate their own purchase or
    -- auction state and may credit a seller or prior bidder without a fresh
    -- client debit in the same request.
    v_internal_function_call :=
      v_context LIKE '%place_username_bid%' OR
      v_context LIKE '%purchase_music_track%' OR
      v_context LIKE '%purchase_username%' OR
      v_context LIKE '%settle_username_auction%';

    IF NOT v_internal_function_call THEN
      DELETE FROM public.acoin_legacy_credit_intents
      WHERE sender_id = v_sender_id
        AND expires_at <= now();

      SELECT id
      INTO v_intent_id
      FROM public.acoin_legacy_credit_intents
      WHERE sender_id = v_sender_id
        AND amount = p_amount
        AND expires_at > now()
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_intent_id IS NULL THEN
        RAISE EXCEPTION 'No matching recent debit authorizes this ACoin credit';
      END IF;

      DELETE FROM public.acoin_legacy_credit_intents
      WHERE id = v_intent_id;
    END IF;
  ELSIF v_role NOT IN ('postgres', 'service_role', 'afuchat_api') THEN
    RAISE EXCEPTION 'Not authorized to credit ACoin';
  END IF;

  UPDATE public.profiles
  SET acoin = COALESCE(acoin, 0) + p_amount
  WHERE id = p_user_id
    AND COALESCE(acoin, 0)::bigint + p_amount::bigint <= 2147483647
  RETURNING id INTO v_updated_user_id;

  IF v_updated_user_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'Recipient wallet balance limit reached';
    END IF;
    RAISE EXCEPTION 'Recipient wallet not found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.credit_acoin(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_acoin(uuid, integer) TO authenticated, service_role, afuchat_api;
NOTIFY pgrst, 'reload schema';
