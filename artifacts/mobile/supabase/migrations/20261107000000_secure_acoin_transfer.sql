CREATE OR REPLACE FUNCTION public.transfer_acoin(
  p_recipient_id uuid,
  p_amount integer,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_sender_id uuid := auth.uid();
  v_sender_balance integer;
  v_recipient_balance integer;
  v_sender_handle text;
  v_recipient_handle text;
  v_note text;
BEGIN
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'You must be signed in to transfer ACoin.');
  END IF;

  IF p_recipient_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Recipient not found.');
  END IF;

  IF p_recipient_id = v_sender_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'You cannot send ACoin to yourself.');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Amount must be greater than zero.');
  END IF;

  v_note := NULLIF(LEFT(BTRIM(COALESCE(p_note, '')), 500), '');

  -- Lock both wallets in a stable order so opposite-direction transfers do not deadlock.
  PERFORM p.id
  FROM public.profiles AS p
  WHERE p.id = v_sender_id OR p.id = p_recipient_id
  ORDER BY p.id
  FOR UPDATE;

  SELECT COALESCE(p.acoin, 0), p.handle
  INTO v_sender_balance, v_sender_handle
  FROM public.profiles AS p
  WHERE p.id = v_sender_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sender wallet not found.');
  END IF;

  SELECT COALESCE(p.acoin, 0), p.handle
  INTO v_recipient_balance, v_recipient_handle
  FROM public.profiles AS p
  WHERE p.id = p_recipient_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Recipient wallet not found.');
  END IF;

  IF v_sender_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient ACoin balance.');
  END IF;

  IF v_recipient_balance::bigint + p_amount::bigint > 2147483647 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Recipient wallet balance limit reached.');
  END IF;

  UPDATE public.profiles
  SET acoin = v_sender_balance - p_amount
  WHERE id = v_sender_id;

  UPDATE public.profiles
  SET acoin = v_recipient_balance + p_amount
  WHERE id = p_recipient_id;

  INSERT INTO public.acoin_transactions (user_id, amount, transaction_type, metadata)
  VALUES
    (
      v_sender_id,
      -p_amount,
      'acoin_transfer_sent',
      jsonb_build_object('to_handle', v_recipient_handle, 'message', v_note)
    ),
    (
      p_recipient_id,
      p_amount,
      'acoin_transfer_received',
      jsonb_build_object('from_handle', v_sender_handle, 'message', v_note)
    );

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_sender_balance - p_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_acoin(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_acoin(uuid, integer, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
