-- Call authorization is based on the existing public chat records. A call is
-- valid only when caller and callee are the two members of a non-group chat.

CREATE OR REPLACE FUNCTION public.is_current_user_direct_call_member(
  p_chat_id uuid,
  p_caller_id uuid,
  p_callee_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_chat_id IS NOT NULL
    AND p_caller_id IS NOT NULL
    AND p_callee_id IS NOT NULL
    AND p_caller_id <> p_callee_id
    AND auth.uid() IN (p_caller_id, p_callee_id)
    AND EXISTS (
      SELECT 1
      FROM public.chats c
      WHERE c.id = p_chat_id
        AND COALESCE(c.is_group, false) = false
        AND COALESCE(c.is_channel, false) = false
    )
    AND EXISTS (
      SELECT 1
      FROM public.chat_members cm
      WHERE cm.chat_id = p_chat_id
        AND cm.user_id = p_caller_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.chat_members cm
      WHERE cm.chat_id = p_chat_id
        AND cm.user_id = p_callee_id
    )
    AND (
      SELECT count(*)
      FROM public.chat_members cm
      WHERE cm.chat_id = p_chat_id
    ) = 2;
$$;

CREATE OR REPLACE FUNCTION public.can_access_current_call_topic(p_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.calls c
    WHERE p_topic = 'call:' || c.id::text
      AND c.status IN ('initiated', 'ringing', 'active')
      AND public.is_current_user_direct_call_member(
        c.chat_id,
        c.caller_id,
        c.callee_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_current_call_inbox(p_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_topic = 'calls:' || auth.uid()::text;
$$;

REVOKE ALL ON FUNCTION public.is_current_user_direct_call_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_current_call_topic(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_current_call_inbox(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_direct_call_member(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_current_call_topic(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_current_call_inbox(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_direct_call_member(uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_access_current_call_topic(text) TO anon;
GRANT EXECUTE ON FUNCTION public.can_access_current_call_inbox(text) TO anon;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calls_select" ON public.calls;
DROP POLICY IF EXISTS "calls_insert" ON public.calls;
DROP POLICY IF EXISTS "calls_update" ON public.calls;
DROP POLICY IF EXISTS "Caller or callee can delete call" ON public.calls;

CREATE POLICY calls_select_direct_participants
ON public.calls
FOR SELECT
TO authenticated
USING (
  public.is_current_user_direct_call_member(chat_id, caller_id, callee_id)
);

CREATE POLICY calls_insert_direct_caller
ON public.calls
FOR INSERT
TO authenticated
WITH CHECK (
  caller_id = (SELECT auth.uid())
  AND status = 'initiated'
  AND public.is_current_user_direct_call_member(chat_id, caller_id, callee_id)
);

CREATE POLICY calls_update_direct_participants
ON public.calls
FOR UPDATE
TO authenticated
USING (
  public.is_current_user_direct_call_member(chat_id, caller_id, callee_id)
)
WITH CHECK (
  public.is_current_user_direct_call_member(chat_id, caller_id, callee_id)
);

CREATE POLICY calls_direct_participant_guard
ON public.calls
AS RESTRICTIVE
FOR ALL
TO public
USING (
  public.is_current_user_direct_call_member(chat_id, caller_id, callee_id)
)
WITH CHECK (
  public.is_current_user_direct_call_member(chat_id, caller_id, callee_id)
);

REVOKE ALL ON public.calls FROM PUBLIC, anon;
REVOKE UPDATE, DELETE ON public.calls FROM authenticated;
GRANT SELECT, INSERT ON public.calls TO authenticated;
GRANT UPDATE (status, answered_at, ended_at, duration_seconds)
ON public.calls TO authenticated;

CREATE INDEX IF NOT EXISTS idx_calls_chat_status
ON public.calls (chat_id, status);

ALTER TABLE public.calls REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END;
$$;

-- Keep private call signaling isolated even if another feature later adds a
-- broad permissive policy on realtime.messages. Other Realtime topics are not
-- changed by these restrictive policies.
DROP POLICY IF EXISTS afuchat_call_topics_read ON realtime.messages;
DROP POLICY IF EXISTS afuchat_call_topics_write ON realtime.messages;
DROP POLICY IF EXISTS afuchat_call_topics_restrict_read ON realtime.messages;
DROP POLICY IF EXISTS afuchat_call_topics_restrict_write ON realtime.messages;

CREATE POLICY afuchat_call_topics_read
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'broadcast'
  AND (
    (
      realtime.topic() LIKE 'call:%'
      AND public.can_access_current_call_topic(realtime.topic())
    )
    OR (
      realtime.topic() LIKE 'calls:%'
      AND public.can_access_current_call_inbox(realtime.topic())
    )
  )
);

CREATE POLICY afuchat_call_topics_write
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND realtime.topic() LIKE 'call:%'
  AND public.can_access_current_call_topic(realtime.topic())
);

CREATE POLICY afuchat_call_topics_restrict_read
ON realtime.messages
AS RESTRICTIVE
FOR SELECT
TO public
USING (
  NOT (
    extension IN ('broadcast', 'presence')
    AND (
      realtime.topic() LIKE 'call:%'
      OR realtime.topic() LIKE 'calls:%'
    )
  )
  OR (
    realtime.topic() LIKE 'call:%'
    AND public.can_access_current_call_topic(realtime.topic())
  )
  OR (
    realtime.topic() LIKE 'calls:%'
    AND public.can_access_current_call_inbox(realtime.topic())
  )
);

CREATE POLICY afuchat_call_topics_restrict_write
ON realtime.messages
AS RESTRICTIVE
FOR INSERT
TO public
WITH CHECK (
  NOT (
    extension IN ('broadcast', 'presence')
    AND (
      realtime.topic() LIKE 'call:%'
      OR realtime.topic() LIKE 'calls:%'
    )
  )
  OR (
    extension = 'broadcast'
    AND realtime.topic() LIKE 'call:%'
    AND public.can_access_current_call_topic(realtime.topic())
  )
);
