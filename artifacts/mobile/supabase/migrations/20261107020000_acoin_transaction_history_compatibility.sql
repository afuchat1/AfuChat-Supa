BEGIN;

-- Keep the existing RPC signatures so installed clients continue to work.
-- The shared metadata keys also let existing AfuPay builds render the other
-- participant without an app update.
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
  v_transfer_id uuid := gen_random_uuid();
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
      jsonb_build_object(
        'item_type', 'username',
        'username', v_recipient_handle,
        'to_handle', v_recipient_handle,
        'to_user_id', p_recipient_id,
        'counterparty_id', p_recipient_id,
        'transfer_id', v_transfer_id,
        'message', v_note
      )
    ),
    (
      p_recipient_id,
      p_amount,
      'acoin_transfer_received',
      jsonb_build_object(
        'item_type', 'username',
        'username', v_sender_handle,
        'from_handle', v_sender_handle,
        'from_user_id', v_sender_id,
        'counterparty_id', v_sender_id,
        'transfer_id', v_transfer_id,
        'message', v_note
      )
    );

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_sender_balance - p_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_acoin(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_acoin(uuid, integer, text) TO authenticated;

-- Old installed clients still use deduct_acoin followed by credit_acoin.
-- Record both sides only after a valid one-use debit intent is consumed.
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
  v_legacy_client_credit boolean := false;
  v_sender_handle text;
  v_recipient_handle text;
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

    -- Preserve the existing trusted purchase and auction RPC paths.
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

      v_legacy_client_credit := true;
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

  IF v_legacy_client_credit THEN
    IF p_user_id = v_sender_id THEN
      -- A self-credit is the legacy refund path, not a wallet-to-wallet transfer.
      INSERT INTO public.acoin_transactions (user_id, amount, transaction_type, metadata)
      VALUES (
        v_sender_id,
        p_amount,
        'acoin_refund',
        jsonb_build_object(
          'legacy_compatibility', true,
          'legacy_intent_id', v_intent_id
        )
      );
    ELSE
      SELECT handle INTO v_sender_handle
      FROM public.profiles
      WHERE id = v_sender_id;

      SELECT handle INTO v_recipient_handle
      FROM public.profiles
      WHERE id = p_user_id;

      IF v_sender_handle IS NULL OR v_recipient_handle IS NULL THEN
        RAISE EXCEPTION 'Transfer participant not found';
      END IF;

      INSERT INTO public.acoin_transactions (user_id, amount, transaction_type, metadata)
      VALUES
        (
          v_sender_id,
          -p_amount,
          'acoin_transfer_sent',
          jsonb_build_object(
            'item_type', 'username',
            'username', v_recipient_handle,
            'to_handle', v_recipient_handle,
            'to_user_id', p_user_id,
            'counterparty_id', p_user_id,
            'transfer_id', v_intent_id,
            'legacy_compatibility', true
          )
        ),
        (
          p_user_id,
          p_amount,
          'acoin_transfer_received',
          jsonb_build_object(
            'item_type', 'username',
            'username', v_sender_handle,
            'from_handle', v_sender_handle,
            'from_user_id', v_sender_id,
            'counterparty_id', v_sender_id,
            'transfer_id', v_intent_id,
            'legacy_compatibility', true
          )
        );
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.credit_acoin(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_acoin(uuid, integer) TO authenticated, service_role, afuchat_api;

-- Repair identifiable older transfer entries. Pair by stored user identity,
-- or by a unique handle match, and do not guess when existing rows are ambiguous.
WITH send_rows AS (
  SELECT
    s.id AS sent_id,
    s.user_id AS sender_id,
    s.amount,
    s.created_at,
    s.metadata,
    sender.handle AS sender_handle,
    COALESCE(recipient_by_id.id, recipient_by_handle.id) AS recipient_id,
    COALESCE(
      NULLIF(s.metadata->>'to_handle', ''),
      recipient_by_id.handle,
      recipient_by_handle.handle
    ) AS recipient_handle
  FROM public.acoin_transactions AS s
  JOIN public.profiles AS sender ON sender.id = s.user_id
  LEFT JOIN public.profiles AS recipient_by_id
    ON recipient_by_id.id::text = s.metadata->>'to_user_id'
  LEFT JOIN public.profiles AS recipient_by_handle
    ON recipient_by_id.id IS NULL
   AND lower(recipient_by_handle.handle) = lower(s.metadata->>'to_handle')
  WHERE s.transaction_type = 'acoin_transfer_sent'
)
UPDATE public.acoin_transactions AS s
SET metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
  'item_type', 'username',
  'username', send_rows.recipient_handle,
  'to_handle', send_rows.recipient_handle,
  'to_user_id', send_rows.recipient_id,
  'counterparty_id', send_rows.recipient_id,
  'transfer_id', send_rows.sent_id,
  'history_backfilled', true
)
FROM send_rows
WHERE s.id = send_rows.sent_id
  AND send_rows.recipient_id IS NOT NULL;

WITH send_rows AS (
  SELECT
    s.id AS sent_id,
    s.user_id AS sender_id,
    s.amount,
    s.created_at,
    sender.handle AS sender_handle,
    COALESCE(recipient_by_id.id, recipient_by_handle.id) AS recipient_id
  FROM public.acoin_transactions AS s
  JOIN public.profiles AS sender ON sender.id = s.user_id
  LEFT JOIN public.profiles AS recipient_by_id
    ON recipient_by_id.id::text = s.metadata->>'to_user_id'
  LEFT JOIN public.profiles AS recipient_by_handle
    ON recipient_by_id.id IS NULL
   AND lower(recipient_by_handle.handle) = lower(s.metadata->>'to_handle')
  WHERE s.transaction_type = 'acoin_transfer_sent'
),
candidate_pairs AS (
  SELECT
    s.sent_id,
    r.id AS received_id,
    count(*) OVER (PARTITION BY s.sent_id) AS sent_match_count,
    count(*) OVER (PARTITION BY r.id) AS received_match_count
  FROM send_rows AS s
  JOIN public.acoin_transactions AS r
    ON r.transaction_type = 'acoin_transfer_received'
   AND r.user_id = s.recipient_id
   AND r.amount = abs(s.amount)
   AND abs(extract(epoch FROM (r.created_at - s.created_at))) <= 5
   AND (
     r.metadata->>'from_user_id' = s.sender_id::text
     OR lower(r.metadata->>'from_handle') = lower(s.sender_handle)
   )
  WHERE s.recipient_id IS NOT NULL
),
unique_pairs AS (
  SELECT sent_id, received_id
  FROM candidate_pairs
  WHERE sent_match_count = 1
    AND received_match_count = 1
)
UPDATE public.acoin_transactions AS r
SET metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object(
  'item_type', 'username',
  'username', sender.handle,
  'from_handle', sender.handle,
  'from_user_id', sender.id,
  'counterparty_id', sender.id,
  'transfer_id', pairs.sent_id,
  'history_backfilled', true
)
FROM unique_pairs AS pairs
JOIN public.acoin_transactions AS sent ON sent.id = pairs.sent_id
JOIN public.profiles AS sender ON sender.id = sent.user_id
WHERE r.id = pairs.received_id;

WITH send_rows AS (
  SELECT
    s.id AS sent_id,
    s.user_id AS sender_id,
    s.amount,
    s.created_at,
    s.metadata,
    sender.handle AS sender_handle,
    COALESCE(recipient_by_id.id, recipient_by_handle.id) AS recipient_id,
    COALESCE(
      NULLIF(s.metadata->>'to_handle', ''),
      recipient_by_id.handle,
      recipient_by_handle.handle
    ) AS recipient_handle
  FROM public.acoin_transactions AS s
  JOIN public.profiles AS sender ON sender.id = s.user_id
  LEFT JOIN public.profiles AS recipient_by_id
    ON recipient_by_id.id::text = s.metadata->>'to_user_id'
  LEFT JOIN public.profiles AS recipient_by_handle
    ON recipient_by_id.id IS NULL
   AND lower(recipient_by_handle.handle) = lower(s.metadata->>'to_handle')
  WHERE s.transaction_type = 'acoin_transfer_sent'
),
candidate_counts AS (
  SELECT s.sent_id, count(r.id) AS matching_receivers
  FROM send_rows AS s
  LEFT JOIN public.acoin_transactions AS r
    ON r.transaction_type = 'acoin_transfer_received'
   AND r.user_id = s.recipient_id
   AND r.amount = abs(s.amount)
   AND abs(extract(epoch FROM (r.created_at - s.created_at))) <= 5
   AND (
     r.metadata->>'from_user_id' = s.sender_id::text
     OR lower(r.metadata->>'from_handle') = lower(s.sender_handle)
   )
  WHERE s.recipient_id IS NOT NULL
  GROUP BY s.sent_id
)
INSERT INTO public.acoin_transactions (user_id, amount, transaction_type, metadata, created_at)
SELECT
  s.recipient_id,
  abs(s.amount),
  'acoin_transfer_received',
  jsonb_build_object(
    'item_type', 'username',
    'username', s.sender_handle,
    'from_handle', s.sender_handle,
    'from_user_id', s.sender_id,
    'counterparty_id', s.sender_id,
    'transfer_id', s.sent_id,
    'history_backfilled', true
  ),
  s.created_at
FROM send_rows AS s
JOIN candidate_counts AS counts ON counts.sent_id = s.sent_id
WHERE counts.matching_receivers = 0;

-- Older P2P rows had no participant metadata. Backfill only pairs that are
-- uniquely identified by amount and timestamp; ambiguous rows remain untouched.
WITH candidate_pairs AS (
  SELECT
    sent.id AS sent_id,
    received.id AS received_id,
    sent.user_id AS sender_id,
    received.user_id AS recipient_id,
    sent.created_at,
    sender.handle AS sender_handle,
    recipient.handle AS recipient_handle,
    count(*) OVER (PARTITION BY sent.id) AS sent_match_count,
    count(*) OVER (PARTITION BY received.id) AS received_match_count
  FROM public.acoin_transactions AS sent
  JOIN public.acoin_transactions AS received
    ON received.transaction_type = 'p2p_receive'
   AND sent.transaction_type = 'p2p_send'
   AND abs(sent.amount) = abs(received.amount)
   AND abs(extract(epoch FROM (received.created_at - sent.created_at))) <= 1
  JOIN public.profiles AS sender ON sender.id = sent.user_id
  JOIN public.profiles AS recipient ON recipient.id = received.user_id
),
unique_pairs AS (
  SELECT *
  FROM candidate_pairs
  WHERE sent_match_count = 1
    AND received_match_count = 1
)
UPDATE public.acoin_transactions AS sent
SET metadata = COALESCE(sent.metadata, '{}'::jsonb) || jsonb_build_object(
  'item_type', 'username',
  'username', pairs.recipient_handle,
  'to_handle', pairs.recipient_handle,
  'to_user_id', pairs.recipient_id,
  'counterparty_id', pairs.recipient_id,
  'transfer_id', pairs.sent_id,
  'history_backfilled', true
)
FROM unique_pairs AS pairs
WHERE sent.id = pairs.sent_id;

WITH candidate_pairs AS (
  SELECT
    sent.id AS sent_id,
    received.id AS received_id,
    sent.user_id AS sender_id,
    received.user_id AS recipient_id,
    sender.handle AS sender_handle,
    recipient.handle AS recipient_handle,
    count(*) OVER (PARTITION BY sent.id) AS sent_match_count,
    count(*) OVER (PARTITION BY received.id) AS received_match_count
  FROM public.acoin_transactions AS sent
  JOIN public.acoin_transactions AS received
    ON received.transaction_type = 'p2p_receive'
   AND sent.transaction_type = 'p2p_send'
   AND abs(sent.amount) = abs(received.amount)
   AND abs(extract(epoch FROM (received.created_at - sent.created_at))) <= 1
  JOIN public.profiles AS sender ON sender.id = sent.user_id
  JOIN public.profiles AS recipient ON recipient.id = received.user_id
),
unique_pairs AS (
  SELECT *
  FROM candidate_pairs
  WHERE sent_match_count = 1
    AND received_match_count = 1
)
UPDATE public.acoin_transactions AS received
SET metadata = COALESCE(received.metadata, '{}'::jsonb) || jsonb_build_object(
  'item_type', 'username',
  'username', pairs.sender_handle,
  'from_handle', pairs.sender_handle,
  'from_user_id', pairs.sender_id,
  'counterparty_id', pairs.sender_id,
  'transfer_id', pairs.sent_id,
  'history_backfilled', true
)
FROM unique_pairs AS pairs
WHERE received.id = pairs.received_id;

NOTIFY pgrst, 'reload schema';
COMMIT;
