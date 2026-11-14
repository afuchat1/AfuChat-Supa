CREATE TABLE IF NOT EXISTS public.revenuecat_acoin_purchases (
  store text NOT NULL CHECK (store IN ('APP_STORE', 'PLAY_STORE')),
  transaction_id text NOT NULL CHECK (length(btrim(transaction_id)) > 0),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL CHECK (product_id IN (
    'acoin_100',
    'acoin_500',
    'acoin_2000',
    'acoin_5000',
    'acoin_20000'
  )),
  acoin_amount integer NOT NULL CHECK (acoin_amount > 0),
  environment text NOT NULL CHECK (environment = 'PRODUCTION'),
  purchased_at timestamptz,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store, transaction_id)
);

ALTER TABLE public.revenuecat_acoin_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.revenuecat_acoin_purchases FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.revenuecat_acoin_purchases TO service_role;

CREATE OR REPLACE FUNCTION public.fulfill_revenuecat_acoin_purchase(
  p_store text,
  p_transaction_id text,
  p_user_id uuid,
  p_product_id text,
  p_environment text,
  p_purchased_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_store text := upper(COALESCE(p_store, ''));
  v_environment text := upper(COALESCE(p_environment, ''));
  v_product_id text := lower(COALESCE(p_product_id, ''));
  v_acoin_amount integer;
  v_inserted boolean := false;
BEGIN
  IF v_store NOT IN ('APP_STORE', 'PLAY_STORE')
    OR v_environment <> 'PRODUCTION'
    OR NULLIF(BTRIM(p_transaction_id), '') IS NULL
    OR p_user_id IS NULL
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid RevenueCat purchase');
  END IF;

  v_acoin_amount := CASE v_product_id
    WHEN 'acoin_100' THEN 100
    WHEN 'acoin_500' THEN 500
    WHEN 'acoin_2000' THEN 2000
    WHEN 'acoin_5000' THEN 5000
    WHEN 'acoin_20000' THEN 20000
    ELSE NULL
  END;

  IF v_acoin_amount IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown Acoin product');
  END IF;

  INSERT INTO public.revenuecat_acoin_purchases (
    store,
    transaction_id,
    user_id,
    product_id,
    acoin_amount,
    environment,
    purchased_at
  )
  VALUES (
    v_store,
    BTRIM(p_transaction_id),
    p_user_id,
    v_product_id,
    v_acoin_amount,
    v_environment,
    p_purchased_at
  )
  ON CONFLICT (store, transaction_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT COALESCE(v_inserted, false) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true);
  END IF;

  UPDATE public.profiles
  SET acoin = COALESCE(acoin, 0) + v_acoin_amount
  WHERE id = p_user_id
    AND COALESCE(acoin, 0)::bigint + v_acoin_amount::bigint <= 2147483647;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'Wallet balance limit reached';
    END IF;
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  INSERT INTO public.acoin_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    p_user_id,
    v_acoin_amount,
    'topup',
    jsonb_build_object(
      'payment_provider', 'revenuecat',
      'store', v_store,
      'transaction_id', BTRIM(p_transaction_id),
      'product_id', v_product_id,
      'environment', v_environment
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'acoin_amount', v_acoin_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fulfill_revenuecat_acoin_purchase(text, text, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_revenuecat_acoin_purchase(text, text, uuid, text, text, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
