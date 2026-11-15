-- Deliver social notification_events through the existing FCM registry.
-- Existing rows are marked skipped so deploying this does not push old events.

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS push_status text,
  ADD COLUMN IF NOT EXISTS push_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_last_error text;

UPDATE public.notification_events
SET push_status = 'skipped'
WHERE push_status IS NULL;

ALTER TABLE public.notification_events
  ALTER COLUMN push_status SET DEFAULT 'pending',
  ALTER COLUMN push_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_events_push_status_check'
      AND conrelid = 'public.notification_events'::regclass
  ) THEN
    ALTER TABLE public.notification_events
      ADD CONSTRAINT notification_events_push_status_check
      CHECK (push_status IN ('pending', 'sending', 'sent', 'skipped', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS notification_events_push_queue_idx
  ON public.notification_events (created_at)
  WHERE push_status IN ('pending', 'failed');

-- Atomically claim one event. A stale "sending" row can be retried after a
-- worker crash; attempts are bounded to prevent repeated push storms.
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
    AND kind IN ('follow', 'like', 'reply', 'reaction', 'comment')
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

REVOKE ALL ON FUNCTION public.claim_notification_push_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_event(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_social_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind NOT IN ('follow', 'like', 'reply', 'reaction', 'comment') THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('eventId', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A push queue outage must never roll back the like, reply, follow, or
  -- reaction that caused this notification.
  RAISE WARNING 'Could not queue social notification push for event %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_events_queue_social_push ON public.notification_events;
CREATE TRIGGER notification_events_queue_social_push
AFTER INSERT ON public.notification_events
FOR EACH ROW
EXECUTE FUNCTION public.queue_social_notification_push();

-- Retry failed or abandoned deliveries without putting push credentials in
-- the database. Each request carries one existing event ID; the Edge Function
-- claims it atomically and caps delivery attempts.
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
      WHERE event.kind IN ('follow', 'like', 'reply', 'reaction', 'comment')
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

-- Keep the notification timeline useful even if the optional @notifications
-- chat account is unavailable. The notification_events row is authoritative;
-- the chat copy is best-effort.
CREATE OR REPLACE FUNCTION public.create_in_app_notification(
  p_recipient_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_cta_label text DEFAULT NULL,
  p_cta_route text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
  v_chat_id uuid;
  v_message_id uuid;
  v_event_id uuid;
  v_actor_id uuid;
BEGIN
  IF p_recipient_id IS NULL THEN
    RAISE EXCEPTION 'Notification recipient is required';
  END IF;

  BEGIN
    v_actor_id := NULLIF(COALESCE(
      p_metadata->>'actor_id',
      p_metadata->>'follower_id',
      p_metadata->>'liker_id',
      p_metadata->>'replier_id'
    ), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;

  -- The event persists independently of its optional mirrored system-chat
  -- message, so its push can still be delivered.
  INSERT INTO public.notification_events (
    recipient_id, actor_id, kind, title, body, cta_label, cta_route,
    entity_id, metadata
  )
  VALUES (
    p_recipient_id, v_actor_id, p_kind, p_title, p_body, p_cta_label,
    p_cta_route, p_entity_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  BEGIN
    SELECT id INTO v_sender_id
    FROM public.profiles
    WHERE lower(handle) = 'notifications'
    LIMIT 1;

    IF v_sender_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended(
          LEAST(p_recipient_id::text, v_sender_id::text) || ':' ||
          GREATEST(p_recipient_id::text, v_sender_id::text),
          0
        )
      );

      SELECT c.id INTO v_chat_id
      FROM public.chats c
      JOIN public.chat_members recipient
        ON recipient.chat_id = c.id AND recipient.user_id = p_recipient_id
      JOIN public.chat_members sender
        ON sender.chat_id = c.id AND sender.user_id = v_sender_id
      WHERE COALESCE(c.is_group, false) = false
        AND COALESCE(c.is_channel, false) = false
      ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
      LIMIT 1;

      IF v_chat_id IS NULL THEN
        INSERT INTO public.chats (is_group, is_channel, created_by)
        VALUES (false, false, v_sender_id)
        RETURNING id INTO v_chat_id;

        INSERT INTO public.chat_members (chat_id, user_id)
        VALUES (v_chat_id, p_recipient_id), (v_chat_id, v_sender_id);
      END IF;

      INSERT INTO public.messages (chat_id, sender_id, encrypted_content)
      VALUES (v_chat_id, v_sender_id, p_title || E'\n' || p_body)
      RETURNING id INTO v_message_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not mirror notification event % to system chat: %', v_event_id, SQLERRM;
  END;

  IF v_message_id IS NOT NULL THEN
    UPDATE public.notification_events
    SET message_id = v_message_id
    WHERE id = v_event_id;
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_in_app_notification(uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_in_app_notification(uuid, text, text, text, text, text, text, jsonb) TO service_role;

-- Record the reverse-follow case so both the inbox and the follow-back push
-- can use the right wording and action.
CREATE OR REPLACE FUNCTION public.notify_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_follow_back boolean;
BEGIN
  IF NEW.follower_id IS NULL OR NEW.following_id IS NULL OR NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = NEW.following_id
      AND following_id = NEW.follower_id
  ) INTO v_follow_back;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(handle, ''), 'Someone')
  INTO v_name
  FROM public.profiles
  WHERE id = NEW.follower_id;

  PERFORM public.create_in_app_notification(
    NEW.following_id,
    'follow',
    COALESCE(v_name, 'Someone') ||
      CASE WHEN v_follow_back THEN ' followed you back' ELSE ' followed you' END,
    CASE WHEN v_follow_back
      THEN 'You are now following each other on AfuChat.'
      ELSE 'See their profile and connect with them on AfuChat.'
    END,
    CASE WHEN v_follow_back THEN 'View profile' ELSE 'Follow back' END,
    '/contact/[id]',
    NEW.follower_id::text,
    jsonb_build_object(
      'follower_id', NEW.follower_id,
      'follow_id', NEW.id,
      'actor_id', NEW.follower_id,
      'follow_back_eligible', NOT v_follow_back
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Notification failures must not prevent a follow from being saved.
  RAISE WARNING 'Could not create follower notification for follow %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Include the actual chat ID in message-reaction notifications so both
-- in-app and push actions open the conversation, not a message as a chat ID.
CREATE OR REPLACE FUNCTION public.notify_message_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_chat_id uuid;
  v_name text;
BEGIN
  SELECT sender_id, chat_id INTO v_recipient, v_chat_id
  FROM public.messages
  WHERE id = NEW.message_id;

  IF v_recipient IS NULL OR v_recipient = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_name := public.notification_actor_name(NEW.user_id);
  PERFORM public.create_in_app_notification(
    v_recipient,
    'reaction',
    COALESCE(v_name, 'Someone') || ' reacted to your message',
    'Open the conversation to see the reaction.',
    'Open chat',
    '/chat/[id]',
    v_chat_id::text,
    jsonb_build_object(
      'message_id', NEW.message_id,
      'chat_id', v_chat_id,
      'reaction', NEW.reaction,
      'actor_id', NEW.user_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A missing optional notification/chat integration must not block reactions.
  RAISE WARNING 'Could not create message-reaction notification: %', SQLERRM;
  RETURN NEW;
END;
$$;
