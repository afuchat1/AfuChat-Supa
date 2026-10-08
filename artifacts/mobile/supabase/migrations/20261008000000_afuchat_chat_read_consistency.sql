-- Draft only: do not apply without explicit production approval.
--
-- Prefer AfuChat rows when a product key exists in both schemas, while keeping
-- legacy-only rows visible. This changes read and authorization behavior only;
-- it copies/deletes no data and does not alter policies or disable RLS.

CREATE OR REPLACE FUNCTION public.can_view_chat_member(
  p_chat_id uuid,
  p_member_user_id uuid,
  p_viewer_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'social'
SET row_security TO 'off'
AS $function$
DECLARE
  v_is_channel boolean;
  v_created_by uuid;
  v_afuchat_admin boolean;
BEGIN
  IF p_viewer_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(c.is_channel, false), c.created_by
  INTO v_is_channel, v_created_by
  FROM chat.chats c
  WHERE c.id = p_chat_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT v_is_channel
     OR p_member_user_id = p_viewer_id
     OR v_created_by = p_viewer_id THEN
    RETURN true;
  END IF;

  SELECT cm.is_admin
  INTO v_afuchat_admin
  FROM afuchat.chat_members cm
  WHERE cm.chat_id = p_chat_id
    AND cm.user_id = p_viewer_id
  LIMIT 1;

  IF FOUND THEN
    RETURN COALESCE(v_afuchat_admin, false);
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM chat.chat_members cm
    WHERE cm.chat_id = p_chat_id
      AND cm.user_id = p_viewer_id
      AND COALESCE(cm.is_admin, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_chat_participant(
  p_chat_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
SET row_security TO 'off'
AS $function$
  SELECT
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM afuchat.chat_members cm
        WHERE cm.chat_id = p_chat_id
          AND cm.user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM chat.chat_members cm
        WHERE cm.chat_id = p_chat_id
          AND cm.user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM chat.chats c
        WHERE c.id = p_chat_id
          AND (c.created_by = p_user_id OR c.user_id = p_user_id)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_send_chat_message(
  p_chat_id uuid,
  p_sender_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM chat.chats c
    LEFT JOIN LATERAL (
      SELECT cm.chat_id, cm.is_admin
      FROM afuchat.chat_members cm
      WHERE cm.chat_id = c.id
        AND cm.user_id = p_sender_id
      ORDER BY cm.id
      LIMIT 1
    ) afu_member ON true
    LEFT JOIN LATERAL (
      SELECT cm.chat_id, cm.is_admin
      FROM chat.chat_members cm
      WHERE cm.chat_id = c.id
        AND cm.user_id = p_sender_id
        AND afu_member.chat_id IS NULL
      ORDER BY cm.id
      LIMIT 1
    ) legacy_member ON true
    WHERE c.id = p_chat_id
      AND (afu_member.chat_id IS NOT NULL OR legacy_member.chat_id IS NOT NULL)
      AND (
        (
          NOT COALESCE(c.is_group, false)
          AND NOT COALESCE(c.is_channel, false)
        )
        OR (
          COALESCE(c.is_channel, false)
          AND CASE
            WHEN afu_member.chat_id IS NOT NULL THEN COALESCE(afu_member.is_admin, false)
            ELSE COALESCE(legacy_member.is_admin, false)
          END
        )
        OR (
          COALESCE(c.is_group, false)
          AND (
            c.who_can_send = 'everyone'
            OR CASE
              WHEN afu_member.chat_id IS NOT NULL THEN COALESCE(afu_member.is_admin, false)
              ELSE COALESCE(legacy_member.is_admin, false)
            END
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_channel_owner_or_admin(
  p_chat_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM chat.chats c
    WHERE c.id = p_chat_id
      AND c.is_channel = true
      AND (
        c.created_by = p_user_id
        OR EXISTS (
          SELECT 1
          FROM afuchat.chat_members cm
          WHERE cm.chat_id = c.id
            AND cm.user_id = p_user_id
            AND COALESCE(cm.is_admin, false)
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM afuchat.chat_members preferred
            WHERE preferred.chat_id = c.id
              AND preferred.user_id = p_user_id
          )
          AND EXISTS (
            SELECT 1
            FROM chat.chat_members legacy
            WHERE legacy.chat_id = c.id
              AND legacy.user_id = p_user_id
              AND COALESCE(legacy.is_admin, false)
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
AS $function$
DECLARE
  v_chat_id uuid;
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR other_user_id IS NULL OR other_user_id = v_me THEN
    RAISE EXCEPTION 'Invalid direct chat participants';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      LEAST(v_me::text, other_user_id::text) || ':' ||
      GREATEST(v_me::text, other_user_id::text),
      0
    )
  );

  WITH membership_pairs AS (
    SELECT cm.chat_id, cm.user_id
    FROM afuchat.chat_members cm
    UNION
    SELECT cm.chat_id, cm.user_id
    FROM chat.chat_members cm
  )
  SELECT c.id
  INTO v_chat_id
  FROM chat.chats c
  JOIN membership_pairs mine
    ON mine.chat_id = c.id
   AND mine.user_id = v_me
  JOIN membership_pairs other
    ON other.chat_id = c.id
   AND other.user_id = other_user_id
  WHERE COALESCE(c.is_group, false) = false
    AND COALESCE(c.is_channel, false) = false
  ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id
  LIMIT 1;

  IF v_chat_id IS NULL THEN
    INSERT INTO chat.chats (is_group, is_channel, created_by)
    VALUES (false, false, v_me)
    RETURNING id INTO v_chat_id;

    INSERT INTO chat.chat_members (chat_id, user_id)
    VALUES (v_chat_id, v_me), (v_chat_id, other_user_id);
  END IF;

  RETURN v_chat_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_chat_list(
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
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH member_candidates AS (
    SELECT cm.chat_id, cm.user_id, cm.is_admin, cm.joined_at, 0 AS source_priority
    FROM afuchat.chat_members cm
    UNION ALL
    SELECT cm.chat_id, cm.user_id, cm.is_admin, cm.joined_at, 1 AS source_priority
    FROM chat.chat_members cm
  ),
  member_pairs AS (
    SELECT DISTINCT ON (mc.chat_id, mc.user_id)
      mc.chat_id, mc.user_id, mc.is_admin, mc.joined_at
    FROM member_candidates mc
    ORDER BY mc.chat_id, mc.user_id, mc.source_priority
  ),
  message_candidates AS (
    SELECT
      m.id, m.chat_id, m.encrypted_content, m.sent_at, m.attachment_type,
      m.sender_id, 0 AS source_priority
    FROM afuchat.messages m
    UNION ALL
    SELECT
      m.id, m.chat_id, m.encrypted_content, m.sent_at, m.attachment_type,
      m.sender_id, 1 AS source_priority
    FROM chat.messages m
  ),
  message_rows AS (
    SELECT DISTINCT ON (mc.id)
      mc.id, mc.chat_id, mc.encrypted_content, mc.sent_at,
      mc.attachment_type, mc.sender_id
    FROM message_candidates mc
    ORDER BY mc.id, mc.source_priority
  ),
  status_candidates AS (
    SELECT
      s.message_id, s.user_id, s.delivered_at, s.read_at,
      0 AS source_priority
    FROM afuchat.message_status s
    UNION ALL
    SELECT
      s.message_id, s.user_id, s.delivered_at, s.read_at,
      1 AS source_priority
    FROM chat.message_status s
  ),
  status_rows AS (
    SELECT DISTINCT ON (sc.message_id, sc.user_id)
      sc.message_id, sc.user_id, sc.delivered_at, sc.read_at
    FROM status_candidates sc
    ORDER BY sc.message_id, sc.user_id, sc.source_priority
  ),
  mute_candidates AS (
    SELECT m.chat_id, m.user_id, m.muted_until, 0 AS source_priority
    FROM afuchat.chat_mutes m
    UNION ALL
    SELECT m.chat_id, m.user_id, m.muted_until, 1 AS source_priority
    FROM chat.chat_mutes m
  ),
  mute_rows AS (
    SELECT DISTINCT ON (mc.chat_id, mc.user_id)
      mc.chat_id, mc.user_id, mc.muted_until
    FROM mute_candidates mc
    ORDER BY mc.chat_id, mc.user_id, mc.source_priority
  ),
  member_chats AS (
    SELECT c.*
    FROM chat.chats c
    WHERE EXISTS (
      SELECT 1
      FROM member_pairs my_membership
      WHERE my_membership.chat_id = c.id
        AND my_membership.user_id = v_user_id
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
        FROM status_rows latest_status
        WHERE latest_status.message_id = latest_message.id
          AND latest_status.user_id <> v_user_id
          AND latest_status.read_at IS NOT NULL
      ) THEN 'read'
      WHEN EXISTS (
        SELECT 1
        FROM status_rows latest_status
        WHERE latest_status.message_id = latest_message.id
          AND latest_status.user_id <> v_user_id
          AND latest_status.delivered_at IS NOT NULL
      ) THEN 'delivered'
      ELSE 'sent'
    END::text,
    CASE
      WHEN c.id = ANY(COALESCE(p_unread_excluded_ids, '{}'::uuid[])) THEN 0
      ELSE (
        SELECT count(*)::bigint
        FROM message_rows unread_message
        WHERE unread_message.chat_id = c.id
          AND unread_message.sender_id <> v_user_id
          AND NOT EXISTS (
            SELECT 1
            FROM status_rows unread_status
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
      p.avatar_url,
      p.is_verified,
      p.is_organization_verified,
      p.last_seen,
      p.show_online_status AS show_online
    FROM member_pairs other_membership
    JOIN accounts.profiles p ON p.id = other_membership.user_id
    WHERE other_membership.chat_id = c.id
      AND other_membership.user_id <> v_user_id
    ORDER BY other_membership.user_id
    LIMIT 1
  ) other_member ON true
  LEFT JOIN LATERAL (
    SELECT
      m.id,
      m.encrypted_content,
      m.sent_at,
      m.attachment_type,
      m.sender_id
    FROM message_rows m
    WHERE m.chat_id = c.id
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT 1
  ) latest_message ON true
  LEFT JOIN mute_rows chat_mute
    ON chat_mute.chat_id = c.id
   AND chat_mute.user_id = v_user_id;
END;
$function$;

-- CREATE OR REPLACE preserves existing grants; state them explicitly for the
-- authenticated paths that rely on these helpers and the conversation RPC.
REVOKE ALL ON FUNCTION public.is_chat_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_send_chat_message(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_chat_member(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_channel_owner_or_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_chat_list(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_chat_message(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_chat_member(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_owner_or_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_list(uuid[]) TO authenticated;
