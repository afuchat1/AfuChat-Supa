BEGIN;

-- One persisted notification and at most one routine push per transaction
-- source row. The prefixes keep IDs unique across the source tables.
CREATE UNIQUE INDEX IF NOT EXISTS notification_events_transaction_entity_uidx
  ON public.notification_events (entity_id)
  WHERE kind = 'transaction_received' AND entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_notification_push_event(p_event_id uuid)
RETURNS SETOF public.notification_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notification_events
  SET push_status = 'sending',
      push_attempts = push_attempts + 1,
      push_last_attempt_at = now(),
      push_last_error = NULL
  WHERE id = p_event_id
    AND kind IN ('follow', 'like', 'reply', 'reaction', 'comment', 'transaction_received')
    AND push_attempts < 5
    AND (
      push_status IN ('pending', 'failed')
      OR (
        push_status = 'sending'
        AND push_last_attempt_at < now() - interval '5 minutes'
      )
    )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_push_event(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_event(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.queue_social_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind NOT IN ('follow', 'like', 'reply', 'reaction', 'comment', 'transaction_received') THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('eventId', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A delivery outage must not roll back a completed transaction.
  RAISE WARNING 'Could not queue notification push for event %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Reuse the existing bounded retry job for transient delivery failures.
DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'retry-social-notification-pushes';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'retry-social-notification-pushes',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/send-push-notification',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('eventId', event.id)
      )
      FROM public.notification_events AS event
      WHERE event.kind IN ('follow', 'like', 'reply', 'reaction', 'comment', 'transaction_received')
        AND event.push_attempts < 5
        AND (
          event.push_status IN ('pending', 'failed')
          OR (
            event.push_status = 'sending'
            AND event.push_last_attempt_at < now() - interval '5 minutes'
          )
        )
        AND (
          event.push_last_attempt_at IS NULL
          OR event.push_last_attempt_at < now() - interval '2 minutes'
        )
      ORDER BY event.created_at ASC
      LIMIT 25;
    $cron$
  );
END
$$;

-- The helper creates a private inbox event. Notification-event triggers queue
-- FCM delivery; no client can manufacture an incoming-payment alert.
CREATE OR REPLACE FUNCTION public.record_wallet_transaction_notification(
  p_transaction_key text,
  p_transaction_id text,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_amount numeric,
  p_currency text,
  p_transaction_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_recipient_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  IF p_actor_id = p_recipient_id THEN
    p_actor_id := NULL;
  END IF;

  INSERT INTO public.notification_events (
    recipient_id,
    actor_id,
    kind,
    title,
    body,
    cta_label,
    cta_route,
    entity_id,
    metadata
  )
  VALUES (
    p_recipient_id,
    p_actor_id,
    'transaction_received',
    p_title,
    p_body,
    'View wallet',
    '/app/afupay',
    p_transaction_key,
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'transaction_key', p_transaction_key,
      'transaction_type', p_transaction_type,
      'amount', p_amount,
      'currency', p_currency,
      'actor_id', p_actor_id
    )
  )
  ON CONFLICT (entity_id)
    WHERE kind = 'transaction_received' AND entity_id IS NOT NULL
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_wallet_transaction_notification(
  text, text, uuid, uuid, text, text, numeric, text, text
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_acoin_transaction_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_type text := COALESCE(NEW.transaction_type, '');
  v_amount text;
  v_actor_id uuid;
  v_actor_handle text;
  v_title text;
  v_body text;
  v_metadata jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
BEGIN
  IF NEW.user_id IS NULL OR COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Top-ups and currency conversions are the user's own wallet activity, not
  -- money received from another account. Rewards are intentionally not pushed.
  IF v_type IN (
    'topup', 'conversion', 'match_gift_conversion',
    'achievement_reward', 'activity_reward', 'reward'
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_actor_id := NULLIF(COALESCE(
      v_metadata->>'from_user_id',
      v_metadata->>'buyer_id',
      v_metadata->>'sender_id',
      v_metadata->>'actor_id'
    ), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;

  -- Only known incoming transaction rows or rows with an explicit counterparty
  -- are eligible. This avoids pushes for unrelated balance adjustments.
  IF v_type NOT IN (
    'acoin_transfer_received',
    'p2p_receive',
    'marketplace_sale',
    'shop_sale_released',
    'shop_refund',
    'acoin_refund',
    'gift_received'
  )
    AND v_type NOT LIKE 'monetize\_%' ESCAPE '\'
    AND v_actor_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF v_actor_id = NEW.user_id THEN
    v_actor_id := NULL;
  END IF;

  v_actor_handle := NULLIF(BTRIM(COALESCE(v_metadata->>'from_handle', '')), '');
  IF v_actor_handle IS NULL AND v_actor_id IS NOT NULL THEN
    SELECT NULLIF(BTRIM(handle), '')
      INTO v_actor_handle
    FROM public.profiles
    WHERE id = v_actor_id;
  END IF;

  v_amount := TO_CHAR(NEW.amount, 'FM999,999,999,990');

  IF v_type = 'shop_sale_released' THEN
    v_title := 'Shop payment received';
    v_body := v_amount || ' ACoin from an order has been released to your wallet.';
  ELSIF v_type = 'shop_refund' OR v_type = 'acoin_refund' THEN
    v_title := 'ACoin refund received';
    v_body := v_amount || ' ACoin was returned to your wallet.';
  ELSIF v_type = 'marketplace_sale' THEN
    v_title := 'Sale payment received';
    v_body := 'You received ' || v_amount || ' ACoin from a marketplace sale.';
  ELSIF v_type = 'monetize_paid_communities' THEN
    v_title := 'Community payment received';
    v_body := 'You received ' || v_amount || ' ACoin from a community membership.';
  ELSIF v_type = 'monetize_freelance' THEN
    v_title := 'Freelance payment received';
    v_body := 'You received ' || v_amount || ' ACoin for freelance work.';
  ELSIF v_type = 'gift_received' THEN
    v_title := 'Gift received';
    v_body := 'You received ' || v_amount || ' ACoin as a gift.';
  ELSE
    v_title := 'ACoin received';
    v_body := 'You received ' || v_amount || ' ACoin' ||
      CASE
        WHEN v_actor_handle IS NOT NULL THEN ' from @' || LTRIM(v_actor_handle, '@')
        ELSE ''
      END || '.';
  END IF;

  PERFORM public.record_wallet_transaction_notification(
    'acoin:' || NEW.id::text,
    NEW.id::text,
    NEW.user_id,
    v_actor_id,
    v_title,
    v_body,
    NEW.amount,
    'ACoin',
    v_type
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not create ACoin received notification for transaction %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acoin_transaction_received_notification ON public.acoin_transactions;
CREATE TRIGGER acoin_transaction_received_notification
AFTER INSERT ON public.acoin_transactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_acoin_transaction_received();

CREATE OR REPLACE FUNCTION public.notify_nexa_transfer_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_handle text;
BEGIN
  IF NEW.receiver_id IS NULL
    OR NEW.sender_id IS NULL
    OR NEW.sender_id = NEW.receiver_id
    OR COALESCE(NEW.amount, 0) <= 0
  THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(BTRIM(handle), '')
    INTO v_actor_handle
  FROM public.profiles
  WHERE id = NEW.sender_id;

  PERFORM public.record_wallet_transaction_notification(
    'nexa:' || NEW.id::text,
    NEW.id::text,
    NEW.receiver_id,
    NEW.sender_id,
    'Nexa received',
    'You received ' || TO_CHAR(NEW.amount, 'FM999,999,999,990') || ' Nexa' ||
      CASE
        WHEN v_actor_handle IS NOT NULL THEN ' from @' || LTRIM(v_actor_handle, '@')
        ELSE ''
      END || '.',
    NEW.amount,
    'Nexa',
    'nexa_transfer'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not create Nexa received notification for transfer %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS xp_transfer_received_notification ON public.xp_transfers;
CREATE TRIGGER xp_transfer_received_notification
AFTER INSERT ON public.xp_transfers
FOR EACH ROW
EXECUTE FUNCTION public.notify_nexa_transfer_received();

CREATE OR REPLACE FUNCTION public.notify_music_sale_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.creator_id IS NULL
    OR NEW.buyer_id IS NULL
    OR NEW.creator_id = NEW.buyer_id
    OR COALESCE(NEW.amount_acoin, 0) <= 0
  THEN
    RETURN NEW;
  END IF;

  PERFORM public.record_wallet_transaction_notification(
    'music:' || NEW.id::text,
    NEW.id::text,
    NEW.creator_id,
    NEW.buyer_id,
    'Music sale received',
    'You received ' || TO_CHAR(NEW.amount_acoin, 'FM999,999,999,990') || ' ACoin from a music purchase.',
    NEW.amount_acoin,
    'ACoin',
    'music_sale'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not create music sale notification for transaction %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_sale_received_notification ON public.music_transactions;
CREATE TRIGGER music_sale_received_notification
AFTER INSERT ON public.music_transactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_music_sale_received();

NOTIFY pgrst, 'reload schema';
COMMIT;
