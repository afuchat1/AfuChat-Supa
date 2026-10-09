BEGIN;

-- AfuChat chat reads and writes use only the existing afuchat tables.
-- These SECURITY DEFINER helpers apply the authenticated caller's membership
-- checks explicitly because PostgREST invokes the RPCs with the user's JWT.
CREATE OR REPLACE FUNCTION afuchat.is_chat_participant(
  p_chat_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, afuchat, auth
SET row_security = off
AS $function$
  SELECT p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM afuchat.chat_members cm
        WHERE cm.chat_id = p_chat_id
          AND cm.user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM afuchat.chats c
        WHERE c.id = p_chat_id
          AND (c.created_by = p_user_id OR c.user_id = p_user_id)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION afuchat.is_chat_admin(
  p_user_id uuid,
  p_chat_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, afuchat, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM afuchat.chat_members cm
    WHERE cm.user_id = p_user_id
      AND cm.chat_id = p_chat_id
      AND COALESCE(cm.is_admin, false)
  );
$function$;

CREATE OR REPLACE FUNCTION afuchat.is_chat_owner(
  p_chat_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, afuchat, auth
SET row_security = off
AS $function$
  SELECT p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM afuchat.chats c
      WHERE c.id = p_chat_id
        AND (c.created_by = p_user_id OR c.user_id = p_user_id)
    );
$function$;

CREATE OR REPLACE FUNCTION afuchat.is_channel_owner_or_admin(
  p_chat_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, afuchat, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM afuchat.chats c
    WHERE c.id = p_chat_id
      AND COALESCE(c.is_channel, false)
      AND (
        c.created_by = p_user_id
        OR EXISTS (
          SELECT 1
          FROM afuchat.chat_members cm
          WHERE cm.chat_id = c.id
            AND cm.user_id = p_user_id
            AND COALESCE(cm.is_admin, false)
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION afuchat.can_view_chat_member(
  p_chat_id uuid,
  p_member_user_id uuid,
  p_viewer_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, afuchat, auth
SET row_security = off
AS $function$
DECLARE
  v_is_channel boolean;
  v_created_by uuid;
BEGIN
  IF p_viewer_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(c.is_channel, false), c.created_by
  INTO v_is_channel, v_created_by
  FROM afuchat.chats c
  WHERE c.id = p_chat_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT v_is_channel THEN
    RETURN afuchat.is_chat_participant(p_chat_id, p_viewer_id);
  END IF;

  IF p_member_user_id = p_viewer_id
     OR v_created_by = p_viewer_id THEN
    RETURN true;
  END IF;

  RETURN afuchat.is_chat_admin(p_viewer_id, p_chat_id);
END;
$function$;

CREATE OR REPLACE FUNCTION afuchat.can_send_chat_message(
  p_chat_id uuid,
  p_sender_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, afuchat, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM afuchat.chats c
    JOIN afuchat.chat_members cm
      ON cm.chat_id = c.id
     AND cm.user_id = p_sender_id
    WHERE c.id = p_chat_id
      AND (
        (
          NOT COALESCE(c.is_group, false)
          AND NOT COALESCE(c.is_channel, false)
        )
        OR (
          COALESCE(c.is_channel, false)
          AND COALESCE(cm.is_admin, false)
        )
        OR (
          COALESCE(c.is_group, false)
          AND (
            c.who_can_send = 'everyone'
            OR COALESCE(cm.is_admin, false)
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION afuchat.get_or_create_direct_chat(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, afuchat, auth
SET row_security = off
AS $function$
DECLARE
  v_chat_id uuid;
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR other_user_id IS NULL OR other_user_id = v_me THEN
    RAISE EXCEPTION 'Invalid direct chat participants';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM afuchat.profiles p WHERE p.id = v_me)
     OR NOT EXISTS (SELECT 1 FROM afuchat.profiles p WHERE p.id = other_user_id) THEN
    RAISE EXCEPTION 'Direct chat participant profile was not found';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      LEAST(v_me::text, other_user_id::text) || ':' ||
      GREATEST(v_me::text, other_user_id::text),
      0
    )
  );

  SELECT c.id
  INTO v_chat_id
  FROM afuchat.chats c
  JOIN afuchat.chat_members mine
    ON mine.chat_id = c.id
   AND mine.user_id = v_me
  JOIN afuchat.chat_members other
    ON other.chat_id = c.id
   AND other.user_id = other_user_id
  WHERE NOT COALESCE(c.is_group, false)
    AND NOT COALESCE(c.is_channel, false)
  ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id
  LIMIT 1;

  IF v_chat_id IS NULL THEN
    INSERT INTO afuchat.chats (is_group, is_channel, created_by)
    VALUES (false, false, v_me)
    RETURNING id INTO v_chat_id;

    INSERT INTO afuchat.chat_members (chat_id, user_id)
    VALUES (v_chat_id, v_me), (v_chat_id, other_user_id);
  END IF;

  RETURN v_chat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION afuchat.get_chat_list(
  p_unread_excluded_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  chat_id text,
  kind text,
  channel_id uuid,
  chat_name text,
  created_by uuid,
  is_group boolean,
  is_channel boolean,
  is_pinned boolean,
  is_archived boolean,
  avatar_url text,
  chat_updated_at timestamptz,
  other_id uuid,
  other_display_name text,
  other_handle text,
  other_avatar text,
  is_verified boolean,
  is_organization_verified boolean,
  other_last_seen timestamptz,
  other_show_online boolean,
  last_message text,
  last_message_at timestamptz,
  last_message_attachment_type text,
  last_message_is_mine boolean,
  last_message_status text,
  unread_count bigint,
  is_muted boolean,
  muted_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, afuchat, auth
SET row_security = off
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH member_chats AS (
    SELECT c.*
    FROM afuchat.chats c
    WHERE EXISTS (
      SELECT 1
      FROM afuchat.chat_members mine
      WHERE mine.chat_id = c.id
        AND mine.user_id = v_user_id
    )
  )
  SELECT
    c.id::text,
    NULL::text,
    NULL::uuid,
    c.name::text,
    CASE
      WHEN c.is_channel AND c.created_by = v_user_id THEN c.created_by
      WHEN c.is_channel THEN NULL
      ELSE c.created_by
    END,
    COALESCE(c.is_group, false),
    COALESCE(c.is_channel, false),
    COALESCE(c.is_pinned, false),
    COALESCE(c.is_archived, false),
    c.avatar_url::text,
    c.updated_at,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.id END,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.display_name::text END,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.handle::text END,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.avatar_url::text END,
    CASE WHEN c.is_channel THEN false ELSE COALESCE(other_member.is_verified, false) END,
    CASE WHEN c.is_channel THEN false ELSE COALESCE(other_member.is_organization_verified, false) END,
    CASE WHEN c.is_channel THEN NULL ELSE other_member.last_seen END,
    CASE WHEN c.is_channel THEN false ELSE COALESCE(other_member.show_online, true) END,
    latest_message.encrypted_content::text,
    latest_message.sent_at,
    latest_message.attachment_type::text,
    COALESCE(latest_message.sender_id = v_user_id, false),
    CASE
      WHEN latest_message.sender_id IS NULL OR latest_message.sender_id <> v_user_id THEN 'sent'
      WHEN EXISTS (
        SELECT 1
        FROM afuchat.message_status status_row
        WHERE status_row.message_id = latest_message.id
          AND status_row.user_id <> v_user_id
          AND status_row.read_at IS NOT NULL
      ) THEN 'read'
      WHEN EXISTS (
        SELECT 1
        FROM afuchat.message_status status_row
        WHERE status_row.message_id = latest_message.id
          AND status_row.user_id <> v_user_id
          AND status_row.delivered_at IS NOT NULL
      ) THEN 'delivered'
      ELSE 'sent'
    END::text,
    CASE
      WHEN c.id = ANY(COALESCE(p_unread_excluded_ids, '{}'::uuid[])) THEN 0
      ELSE (
        SELECT count(*)::bigint
        FROM afuchat.messages unread_message
        WHERE unread_message.chat_id = c.id
          AND unread_message.sender_id <> v_user_id
          AND NOT EXISTS (
            SELECT 1
            FROM afuchat.message_status unread_status
            WHERE unread_status.message_id = unread_message.id
              AND unread_status.user_id = v_user_id
              AND unread_status.read_at IS NOT NULL
          )
      )
    END,
    (chat_mute.chat_id IS NOT NULL),
    chat_mute.muted_until
  FROM member_chats c
  LEFT JOIN LATERAL (
    SELECT
      p.id,
      p.display_name,
      p.handle,
      p.avatar_url,
      p.is_verified,
      p.is_organization_verified,
      p.last_seen,
      p.show_online_status AS show_online
    FROM afuchat.chat_members membership
    JOIN afuchat.profiles p ON p.id = membership.user_id
    WHERE membership.chat_id = c.id
      AND membership.user_id <> v_user_id
    ORDER BY membership.user_id
    LIMIT 1
  ) other_member ON true
  LEFT JOIN LATERAL (
    SELECT m.id, m.encrypted_content, m.sent_at, m.attachment_type, m.sender_id
    FROM afuchat.messages m
    WHERE m.chat_id = c.id
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT 1
  ) latest_message ON true
  LEFT JOIN afuchat.chat_mutes chat_mute
    ON chat_mute.chat_id = c.id
   AND chat_mute.user_id = v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION afuchat.is_chat_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION afuchat.is_chat_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION afuchat.is_chat_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION afuchat.is_channel_owner_or_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION afuchat.can_view_chat_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION afuchat.can_send_chat_message(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION afuchat.get_or_create_direct_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION afuchat.get_chat_list(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION afuchat.is_chat_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION afuchat.is_chat_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION afuchat.is_chat_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION afuchat.is_channel_owner_or_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION afuchat.can_view_chat_member(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION afuchat.can_send_chat_message(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION afuchat.get_or_create_direct_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION afuchat.get_chat_list(uuid[]) TO authenticated;

-- Bind each chat policy to helpers that query AfuChat tables only.
DROP POLICY IF EXISTS chat_members_delete_self_or_manager ON afuchat.chat_members;
CREATE POLICY chat_members_delete_self_or_manager
  ON afuchat.chat_members FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR afuchat.is_channel_owner_or_admin(chat_id, auth.uid())
    OR afuchat.is_chat_admin(auth.uid(), chat_id)
    OR afuchat.is_chat_owner(chat_id, auth.uid())
  );

DROP POLICY IF EXISTS chat_members_insert_self_or_manager ON afuchat.chat_members;
CREATE POLICY chat_members_insert_self_or_manager
  ON afuchat.chat_members FOR INSERT TO authenticated
  WITH CHECK (
    afuchat.is_channel_owner_or_admin(chat_id, auth.uid())
    OR afuchat.is_chat_admin(auth.uid(), chat_id)
    OR afuchat.is_chat_owner(chat_id, auth.uid())
    OR (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1
        FROM afuchat.chats c
        WHERE c.id = chat_id
          AND (COALESCE(c.is_group, false) OR COALESCE(c.is_channel, false))
          AND NOT COALESCE(c.is_private, false)
      )
    )
  );

DROP POLICY IF EXISTS chat_members_select_privacy ON afuchat.chat_members;
CREATE POLICY chat_members_select_privacy
  ON afuchat.chat_members FOR SELECT TO authenticated
  USING (afuchat.can_view_chat_member(chat_id, user_id, auth.uid()));

DROP POLICY IF EXISTS chat_members_update_manager ON afuchat.chat_members;
CREATE POLICY chat_members_update_manager
  ON afuchat.chat_members FOR UPDATE TO authenticated
  USING (
    afuchat.is_channel_owner_or_admin(chat_id, auth.uid())
    OR afuchat.is_chat_admin(auth.uid(), chat_id)
    OR afuchat.is_chat_owner(chat_id, auth.uid())
  )
  WITH CHECK (
    afuchat.is_channel_owner_or_admin(chat_id, auth.uid())
    OR afuchat.is_chat_admin(auth.uid(), chat_id)
    OR afuchat.is_chat_owner(chat_id, auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update group chats" ON afuchat.chats;
CREATE POLICY "Admins can update group chats"
  ON afuchat.chats FOR UPDATE TO authenticated
  USING (afuchat.is_chat_admin(auth.uid(), id));

DROP POLICY IF EXISTS chats_select_public_or_member ON afuchat.chats;
CREATE POLICY chats_select_public_or_member
  ON afuchat.chats FOR SELECT TO authenticated
  USING (
    (
      (COALESCE(is_group, false) OR COALESCE(is_channel, false))
      AND NOT COALESCE(is_private, false)
    )
    OR afuchat.is_chat_participant(id, auth.uid())
  );

DROP POLICY IF EXISTS chats_manage_owner ON afuchat.chats;
CREATE POLICY chats_manage_owner
  ON afuchat.chats FOR ALL TO authenticated
  USING (afuchat.is_chat_owner(id, auth.uid()));

DROP POLICY IF EXISTS messages_insert_member_sender ON afuchat.messages;
CREATE POLICY messages_insert_member_sender
  ON afuchat.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND afuchat.can_send_chat_message(chat_id, auth.uid())
  );

DROP POLICY IF EXISTS messages_select_member ON afuchat.messages;
CREATE POLICY messages_select_member
  ON afuchat.messages FOR SELECT TO authenticated
  USING (afuchat.is_chat_participant(chat_id, auth.uid()));

-- Retarget chat identity constraints without validating or changing historical
-- rows. The production catalog contains existing profile-orphan rows; NOT
-- VALID preserves them while enforcing afuchat profiles for new writes.
ALTER TABLE afuchat.chat_members
  DROP CONSTRAINT IF EXISTS chat_members_user_id_fkey;
ALTER TABLE afuchat.chat_members
  ADD CONSTRAINT chat_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES afuchat.profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE afuchat.chats
  DROP CONSTRAINT IF EXISTS chats_created_by_fkey;
ALTER TABLE afuchat.chats
  ADD CONSTRAINT chats_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES afuchat.profiles(id) NOT VALID;

ALTER TABLE afuchat.messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE afuchat.messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES afuchat.profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE afuchat.message_status
  DROP CONSTRAINT IF EXISTS message_status_user_id_fkey;
ALTER TABLE afuchat.message_status
  ADD CONSTRAINT message_status_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES afuchat.profiles(id) ON DELETE CASCADE NOT VALID;

COMMIT;
