-- Mentioned users receive the story in a direct chat and a social notification.
-- Delivery rows make the client RPC safe to retry without duplicating messages.

CREATE TABLE IF NOT EXISTS public.story_mention_deliveries (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  notification_id uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, mentioned_user_id)
);

ALTER TABLE public.story_mention_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.story_mention_deliveries FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.share_story_mentions(p_story_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_handle text;
  v_mentioned_user_id uuid;
  v_actor_name text;
  v_chat_id uuid;
  v_message_id uuid;
  v_notification_id uuid;
  v_claimed boolean;
  v_delivered integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to share a story mention';
  END IF;

  SELECT *
  INTO v_story
  FROM public.stories
  WHERE id = p_story_id
    AND user_id = v_actor_id
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Story not found or no longer active';
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(handle, ''), 'Someone')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;
  v_actor_name := COALESCE(v_actor_name, 'Someone');

  FOR v_handle IN
    SELECT DISTINCT lower(mention_capture.parts[2])
    FROM regexp_matches(
      COALESCE(v_story.caption, ''),
      '(^|[^[:alnum:]_.-])@([[:alnum:]_.-]{1,32})([^[:alnum:]_.-]|$)',
      'gi'
    ) AS mention_capture(parts)
  LOOP
    SELECT id
    INTO v_mentioned_user_id
    FROM public.profiles
    WHERE lower(handle) = v_handle
      AND id <> v_actor_id
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_claimed := false;
    INSERT INTO public.story_mention_deliveries (story_id, mentioned_user_id)
    VALUES (v_story.id, v_mentioned_user_id)
    ON CONFLICT (story_id, mentioned_user_id) DO NOTHING
    RETURNING true INTO v_claimed;

    IF NOT COALESCE(v_claimed, false) THEN
      CONTINUE;
    END IF;

    v_chat_id := public.get_or_create_direct_chat(v_mentioned_user_id);

    INSERT INTO public.messages (
      chat_id,
      sender_id,
      encrypted_content,
      attachment_url,
      attachment_type
    )
    VALUES (
      v_chat_id,
      v_actor_id,
      'storyUserId:' || v_story.user_id::text || '|Shared a story|storyId:' || v_story.id::text,
      v_story.media_url,
      'story_reply'
    )
    RETURNING id INTO v_message_id;

    v_notification_id := public.create_in_app_notification(
      v_mentioned_user_id,
      'story_mention',
      v_actor_name || ' mentioned you in a story',
      'The story was shared with you in chat.',
      'View story',
      '/stories/view',
      v_story.user_id::text,
      jsonb_build_object(
        'story_id', v_story.id,
        'story_owner_id', v_story.user_id,
        'actor_id', v_actor_id,
        'chat_id', v_chat_id,
        'message_id', v_message_id
      )
    );

    UPDATE public.story_mention_deliveries
    SET chat_id = v_chat_id,
        message_id = v_message_id,
        notification_id = v_notification_id
    WHERE story_id = v_story.id
      AND mentioned_user_id = v_mentioned_user_id;

    v_delivered := v_delivered + 1;
  END LOOP;

  RETURN v_delivered;
END;
$$;

REVOKE ALL ON FUNCTION public.share_story_mentions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_story_mentions(uuid) TO authenticated;

-- Allow story mention events through the existing social push delivery queue.
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
    AND kind IN ('follow', 'like', 'reply', 'reaction', 'comment', 'story_mention')
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
  IF NEW.kind NOT IN ('follow', 'like', 'reply', 'reaction', 'comment', 'story_mention') THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('eventId', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not queue social notification push for event %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

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
      WHERE event.kind IN ('follow', 'like', 'reply', 'reaction', 'comment', 'story_mention')
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
