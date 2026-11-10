BEGIN;

-- Serialize the requested payment with the request's state transition so a
-- retry cannot transfer twice after the request has already been completed.
CREATE OR REPLACE FUNCTION public.respond_to_money_request(
  p_request_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_request public.money_requests%ROWTYPE;
  v_transfer jsonb;
  v_amount integer;
  v_sender_xp integer;
  v_requester_xp integer;
  v_transfer_note text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sign in to manage this request.');
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('pay', 'decline') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Choose pay or decline.');
  END IF;

  SELECT *
  INTO v_request
  FROM public.money_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'This request is unavailable.');
  END IF;

  IF v_request.target_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'This request is unavailable.');
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'message', 'This request has already been answered.');
  END IF;

  IF p_action = 'decline' THEN
    UPDATE public.money_requests
    SET status = 'declined'
    WHERE id = v_request.id
      AND target_id = v_user_id
      AND status = 'pending';

    RETURN jsonb_build_object('success', true, 'status', 'declined');
  END IF;

  IF v_request.requester_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'You cannot pay a request to yourself.');
  END IF;

  v_amount := COALESCE(v_request.amount, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'This request has an invalid amount.');
  END IF;

  v_transfer_note := LEFT(
    'Payment request ' || v_request.id::text ||
    CASE
      WHEN NULLIF(BTRIM(COALESCE(v_request.note, '')), '') IS NULL THEN ''
      ELSE ': ' || BTRIM(v_request.note)
    END,
    500
  );

  IF v_request.currency = 'acoin' THEN
    -- Reuse the existing authenticated, atomic ACoin transfer and keep the
    -- request update in this same database transaction.
    v_transfer := public.transfer_acoin(
      v_request.requester_id,
      v_amount,
      v_transfer_note
    );

    IF NOT COALESCE((v_transfer ->> 'success')::boolean, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', COALESCE(v_transfer ->> 'message', 'ACoin transfer failed.')
      );
    END IF;
  ELSIF v_request.currency = 'nexa' THEN
    -- Lock both balances in a stable order and record the same history sources
    -- used by regular Nexa transfers.
    PERFORM p.id
    FROM public.profiles AS p
    WHERE p.id = v_user_id OR p.id = v_request.requester_id
    ORDER BY p.id
    FOR UPDATE;

    SELECT COALESCE(p.xp, 0)
    INTO v_sender_xp
    FROM public.profiles AS p
    WHERE p.id = v_user_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Your wallet was not found.');
    END IF;

    SELECT COALESCE(p.xp, 0)
    INTO v_requester_xp
    FROM public.profiles AS p
    WHERE p.id = v_request.requester_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'The requester wallet was not found.');
    END IF;

    IF v_sender_xp < v_amount THEN
      RETURN jsonb_build_object('success', false, 'message', 'You do not have enough Nexa.');
    END IF;

    IF v_requester_xp::bigint + v_amount::bigint > 2147483647 THEN
      RETURN jsonb_build_object('success', false, 'message', 'The recipient Nexa balance limit was reached.');
    END IF;

    UPDATE public.profiles
    SET xp = v_sender_xp - v_amount
    WHERE id = v_user_id;

    UPDATE public.profiles
    SET xp = v_requester_xp + v_amount
    WHERE id = v_request.requester_id;

    INSERT INTO public.xp_transfers (sender_id, receiver_id, amount, message)
    VALUES (v_user_id, v_request.requester_id, v_amount, v_transfer_note);

    INSERT INTO public.xp_activity_log (user_id, activity_type, xp_amount, metadata)
    VALUES (
      v_request.requester_id,
      'nexa_transfer_received',
      v_amount,
      jsonb_build_object('from_user_id', v_user_id, 'money_request_id', v_request.id)
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'This currency is not supported.');
  END IF;

  UPDATE public.money_requests
  SET status = 'completed'
  WHERE id = v_request.id
    AND target_id = v_user_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Money request state changed during payment.';
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'completed');
END;
$function$;

REVOKE ALL ON FUNCTION public.respond_to_money_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_money_request(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
