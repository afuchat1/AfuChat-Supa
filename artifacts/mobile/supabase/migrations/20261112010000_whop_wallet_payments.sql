CREATE TABLE IF NOT EXISTS public.whop_payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (purpose IN ('topup', 'donation')),
  usd_amount numeric(12, 2) NOT NULL CHECK (usd_amount > 0),
  acoin_amount integer CHECK (acoin_amount IS NULL OR acoin_amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  whop_checkout_configuration_id text UNIQUE,
  whop_account_id text,
  whop_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT whop_topup_amount_consistent CHECK (
    (purpose = 'topup' AND acoin_amount IS NOT NULL AND usd_amount = acoin_amount::numeric / 100)
    OR (purpose = 'donation' AND acoin_amount IS NULL)
  )
);

ALTER TABLE public.whop_payment_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whop_payment_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whop_payment_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.fulfill_whop_payment(
  p_session_id uuid,
  p_whop_payment_id text,
  p_amount_usd numeric,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_session public.whop_payment_sessions%ROWTYPE;
BEGIN
  IF p_session_id IS NULL
    OR NULLIF(BTRIM(p_whop_payment_id), '') IS NULL
    OR p_amount_usd IS NULL
    OR p_amount_usd <= 0
    OR lower(COALESCE(p_currency, '')) <> 'usd'
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid payment details');
  END IF;

  SELECT *
  INTO v_session
  FROM public.whop_payment_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment session not found');
  END IF;

  IF v_session.status = 'paid' THEN
    IF v_session.whop_payment_id = p_whop_payment_id THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_processed', true,
        'purpose', v_session.purpose,
        'acoin_amount', v_session.acoin_amount
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'Payment session already fulfilled');
  END IF;

  IF v_session.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment session is not pending');
  END IF;

  IF round(p_amount_usd, 2) <> v_session.usd_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment amount does not match checkout');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.whop_payment_sessions
    WHERE whop_payment_id = p_whop_payment_id
      AND id <> p_session_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment was already applied');
  END IF;

  IF v_session.purpose = 'topup' THEN
    IF v_session.user_id IS NULL OR v_session.acoin_amount IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Top-up session is incomplete');
    END IF;

    UPDATE public.profiles
    SET acoin = COALESCE(acoin, 0) + v_session.acoin_amount
    WHERE id = v_session.user_id
      AND COALESCE(acoin, 0)::bigint + v_session.acoin_amount::bigint <= 2147483647;

    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_session.user_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Wallet balance limit reached');
      END IF;
      RETURN jsonb_build_object('ok', false, 'error', 'Wallet not found');
    END IF;

    INSERT INTO public.acoin_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      v_session.user_id,
      v_session.acoin_amount,
      'topup',
      jsonb_build_object(
        'payment_provider', 'whop',
        'whop_payment_id', p_whop_payment_id,
        'payment_session_id', v_session.id,
        'usd_amount', v_session.usd_amount
      )
    );
  END IF;

  UPDATE public.whop_payment_sessions
  SET status = 'paid',
      whop_payment_id = p_whop_payment_id,
      paid_at = now()
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'purpose', v_session.purpose,
    'acoin_amount', v_session.acoin_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fulfill_whop_payment(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_whop_payment(uuid, text, numeric, text) TO service_role;

NOTIFY pgrst, 'reload schema';
