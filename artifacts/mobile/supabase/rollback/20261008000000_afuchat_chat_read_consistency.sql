-- Rollback for 20261008000000_afuchat_chat_read_consistency.sql.
-- Restores function bodies captured from production before the proposed change.
-- This does not alter table data, policies, or function grants.

CREATE OR REPLACE FUNCTION public.can_view_chat_member(p_chat_id uuid, p_member_user_id uuid, p_viewer_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
SET row_security TO 'off'
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
  FROM chat.chats c
  WHERE c.id = p_chat_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT v_is_channel OR p_member_user_id = p_viewer_id OR v_created_by = p_viewer_id THEN
    RETURN true;
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

CREATE OR REPLACE FUNCTION public.is_chat_participant(p_chat_id uuid, p_user_id uuid DEFAULT auth.uid())
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

CREATE OR REPLACE FUNCTION public.can_send_chat_message(p_chat_id uuid, p_sender_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM chat.chat_members cm
    JOIN chat.chats c ON c.id = cm.chat_id
    WHERE cm.chat_id = p_chat_id
      AND cm.user_id = p_sender_id
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

CREATE OR REPLACE FUNCTION public.is_channel_owner_or_admin(p_chat_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'chat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
SET row_security TO 'off'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM chat.chats c
    WHERE c.id = p_chat_id
      AND c.is_channel = true
      AND (
        c.created_by = p_user_id
        OR EXISTS (
          SELECT 1
          FROM chat.chat_members cm
          WHERE cm.chat_id = c.id
            AND cm.user_id = p_user_id
            AND cm.is_admin = true
        )
      )
  );
END;
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

  SELECT c.id
  INTO v_chat_id
  FROM chat.chats c
  JOIN chat.chat_members mine
    ON mine.chat_id = c.id
   AND mine.user_id = v_me
  JOIN chat.chat_members other
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

CREATE OR REPLACE FUNCTION public.get_chat_list(p_unread_excluded_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS TABLE(
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
  chat_updated_at timestamp with time zone,
  other_id uuid,
  other_display_name text,
  other_avatar text,
  is_verified boolean,
  is_organization_verified boolean,
  other_last_seen timestamp with time zone,
  other_show_online boolean,
  last_message text,
  last_message_at timestamp with time zone,
  last_message_attachment_type text,
  last_message_is_mine boolean,
  last_message_status text,
  unread_count bigint,
  is_muted boolean,
  muted_until timestamp with time zone
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
  WITH member_chats AS (
    SELECT c.*
    FROM chat.chats c
    WHERE EXISTS (
      SELECT 1
      FROM chat.chat_members my_membership
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
        FROM chat.message_status latest_status
        WHERE latest_status.message_id = latest_message.id
          AND latest_status.user_id <> v_user_id
          AND latest_status.read_at IS NOT NULL
      ) THEN 'read'
      WHEN EXISTS (
        SELECT 1
        FROM chat.message_status latest_status
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
        FROM chat.messages unread_message
        WHERE unread_message.chat_id = c.id
          AND unread_message.sender_id <> v_user_id
          AND NOT EXISTS (
            SELECT 1
            FROM chat.message_status unread_status
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
    FROM chat.chat_members other_membership
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
    FROM chat.messages m
    WHERE m.chat_id = c.id
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT 1
  ) latest_message ON true
  LEFT JOIN chat.chat_mutes chat_mute
    ON chat_mute.chat_id = c.id
   AND chat_mute.user_id = v_user_id;
END;
$function$;
