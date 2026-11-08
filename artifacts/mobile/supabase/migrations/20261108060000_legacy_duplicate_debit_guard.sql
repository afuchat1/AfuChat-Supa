BEGIN;

-- Older clients use deduct_acoin followed by credit_acoin and do not send an
-- idempotency key. Keep a short per-user/per-amount window to reject a
-- duplicate debit before it can reduce the sender's balance a second time.
CREATE TABLE IF NOT EXISTS public.acoin_legacy_debit_guard (
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  last_attempt_at timestamptz NOT NULL,
  PRIMARY KEY (sender_id, amount)
);

ALTER TABLE public.acoin_legacy_debit_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.acoin_legacy_debit_guard
  FROM PUBLIC, anon, authenticated, service_role, afuchat_api;

COMMENT ON TABLE public.acoin_legacy_debit_guard IS
  'Short-lived duplicate guard for legacy direct deduct_acoin RPC calls that lack a client idempotency key.';

CREATE OR REPLACE FUNCTION public.deduct_acoin(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_current_acoin integer;
  v_context text := lower(COALESCE(current_query(), ''));
  v_now timestamptz;
  v_guard_claimed boolean := false;
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

  IF auth.role() = 'authenticated' AND v_context LIKE '%deduct_acoin%' THEN
    v_now := clock_timestamp();

    DELETE FROM public.acoin_legacy_debit_guard
    WHERE sender_id = auth.uid()
      AND last_attempt_at < v_now - interval '1 day';

    INSERT INTO public.acoin_legacy_debit_guard AS existing_guard
      (sender_id, amount, last_attempt_at)
    VALUES (auth.uid(), p_amount, v_now)
    ON CONFLICT (sender_id, amount) DO UPDATE
      SET last_attempt_at = EXCLUDED.last_attempt_at
      WHERE existing_guard.last_attempt_at <= v_now - interval '10 seconds'
    RETURNING true INTO v_guard_claimed;

    IF NOT COALESCE(v_guard_claimed, false) THEN
      RAISE EXCEPTION 'An ACoin debit for this amount was just submitted. Check your wallet before retrying.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.profiles
  SET acoin = acoin - p_amount
  WHERE id = auth.uid();

  -- Keep the existing one-use intent protocol for installed clients.
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

NOTIFY pgrst, 'reload schema';

COMMIT;
