-- Canonical AfuChat database cutover.
-- Repoint AfuChat reads/writes and external foreign keys to afuchat.*.
-- Keep the divergent legacy chat schema and all of its rows as an inactive
-- archive; do not copy, re-key, overwrite, or delete production chat data.
-- PostgREST currently exposes public but not afuchat, so its compatibility
-- RPCs remain in public while their implementations use afuchat exclusively.
--
-- The whole cutover is one DO statement so any failed check rolls back all
-- routine and foreign-key changes together.
DO $afuchat_cutover$
DECLARE
  v_routine record;
  v_definition text;
  v_fk record;
  v_afuchat_relation regclass;
  v_new_fk_definition text;
  v_temporary_name text;
  v_validated boolean;
BEGIN
  -- These production routines merge data from both schemas. Replace them with
  -- canonical-only implementations instead of blindly rewriting both sources
  -- to afuchat and leaving duplicate branches behind.
  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.can_send_chat_message(
      p_chat_id uuid,
      p_sender_id uuid DEFAULT auth.uid()
    )
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'afuchat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
    SET row_security TO 'off'
    AS $body$
      SELECT EXISTS (
        SELECT 1
        FROM afuchat.chats c
        JOIN afuchat.chat_members member_row
          ON member_row.chat_id = c.id
         AND member_row.user_id = p_sender_id
        WHERE c.id = p_chat_id
          AND (
            (
              NOT COALESCE(c.is_group, false)
              AND NOT COALESCE(c.is_channel, false)
            )
            OR (
              COALESCE(c.is_channel, false)
              AND COALESCE(member_row.is_admin, false)
            )
            OR (
              COALESCE(c.is_group, false)
              AND (
                c.who_can_send = 'everyone'
                OR COALESCE(member_row.is_admin, false)
              )
            )
          )
      );
    $body$;
  $ddl$;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.can_view_chat_member(
      p_chat_id uuid,
      p_member_user_id uuid,
      p_viewer_id uuid DEFAULT auth.uid()
    )
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'afuchat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
    SET row_security TO 'off'
    AS $body$
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

      IF NOT v_is_channel
         OR p_member_user_id = p_viewer_id
         OR v_created_by = p_viewer_id THEN
        RETURN true;
      END IF;

      RETURN EXISTS (
        SELECT 1
        FROM afuchat.chat_members cm
        WHERE cm.chat_id = p_chat_id
          AND cm.user_id = p_viewer_id
          AND COALESCE(cm.is_admin, false)
      );
    END;
    $body$;
  $ddl$;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.is_channel_owner_or_admin(
      p_chat_id uuid,
      p_user_id uuid DEFAULT auth.uid()
    )
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'afuchat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
    SET row_security TO 'off'
    AS $body$
      SELECT EXISTS (
        SELECT 1
        FROM afuchat.chats c
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
          )
      );
    $body$;
  $ddl$;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.is_chat_participant(
      p_chat_id uuid,
      p_user_id uuid DEFAULT auth.uid()
    )
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'afuchat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
    SET row_security TO 'off'
    AS $body$
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
    $body$;
  $ddl$;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(other_user_id uuid)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'afuchat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
    AS $body$
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
      FROM afuchat.chats c
      JOIN afuchat.chat_members mine
        ON mine.chat_id = c.id
       AND mine.user_id = v_me
      JOIN afuchat.chat_members other
        ON other.chat_id = c.id
       AND other.user_id = other_user_id
      WHERE COALESCE(c.is_group, false) = false
        AND COALESCE(c.is_channel, false) = false
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
    $body$;
  $ddl$;

  EXECUTE $ddl$
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
    SET search_path TO 'public', 'extensions', 'accounts', 'ads', 'afuai', 'billing', 'afuchat', 'devs', 'games', 'mail', 'match', 'media', 'platform', 'rewards', 'shop', 'social'
    AS $body$
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
          FROM afuchat.chat_members my_membership
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
            FROM afuchat.message_status latest_status
            WHERE latest_status.message_id = latest_message.id
              AND latest_status.user_id <> v_user_id
              AND latest_status.read_at IS NOT NULL
          ) THEN 'read'
          WHEN EXISTS (
            SELECT 1
            FROM afuchat.message_status latest_status
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
          p.avatar_url,
          p.is_verified,
          p.is_organization_verified,
          p.last_seen,
          p.show_online_status AS show_online
        FROM afuchat.chat_members other_membership
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
        FROM afuchat.messages m
        WHERE m.chat_id = c.id
        ORDER BY m.sent_at DESC, m.id DESC
        LIMIT 1
      ) latest_message ON true
      LEFT JOIN afuchat.chat_mutes chat_mute
        ON chat_mute.chat_id = c.id
       AND chat_mute.user_id = v_user_id;
    END;
    $body$;
  $ddl$;

  -- Preserve signatures, owners, grants, and security attributes on the
  -- remaining single-source routines while retargeting their schema refs.
  FOR v_routine IN
    SELECT p.oid
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname <> 'chat'
      AND p.prokind IN ('f', 'p')
      AND p.prosrc ~ '(^|[^A-Za-z0-9_])chat\.'
      AND NOT (
        n.nspname = 'public'
        AND p.proname IN (
          'can_send_chat_message',
          'can_view_chat_member',
          'is_channel_owner_or_admin',
          'is_chat_participant',
          'get_or_create_direct_chat',
          'get_chat_list'
        )
      )
    ORDER BY p.oid
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_routine.oid);
    v_definition := pg_catalog.regexp_replace(
      v_definition,
      '(^|[^A-Za-z0-9_])chat\.',
      '\1afuchat.',
      'g'
    );
    v_definition := pg_catalog.replace(
      v_definition,
      ', ''chat'',',
      ', ''afuchat'','
    );
    EXECUTE v_definition;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname <> 'chat'
      AND p.prokind IN ('f', 'p')
      AND p.prosrc ~ '(^|[^A-Za-z0-9_])chat\.'
  ) THEN
    RAISE EXCEPTION 'A non-legacy routine still explicitly references chat.*';
  END IF;

  -- Rebind external foreign keys to matching AfuChat tables. Keep each old
  -- foreign key until the replacement has validated successfully.
  FOR v_fk IN
    SELECT
      con.oid AS constraint_oid,
      child_ns.nspname AS child_schema,
      child.relname AS child_table,
      con.conname AS constraint_name,
      parent.relname AS parent_table,
      pg_catalog.pg_get_constraintdef(con.oid) AS constraint_definition
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class child ON child.oid = con.conrelid
    JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class parent ON parent.oid = con.confrelid
    JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE con.contype = 'f'
      AND parent_ns.nspname = 'chat'
      AND child_ns.nspname <> 'chat'
    ORDER BY child_ns.nspname, child.relname, con.conname
  LOOP
    v_afuchat_relation := pg_catalog.to_regclass(
      pg_catalog.format('%I.%I', 'afuchat', v_fk.parent_table)
    );
    IF v_afuchat_relation IS NULL THEN
      RAISE EXCEPTION 'Cannot rebind %.% constraint %: AfuChat parent %.% is missing',
        v_fk.child_schema, v_fk.child_table, v_fk.constraint_name,
        'afuchat', v_fk.parent_table;
    END IF;

    v_new_fk_definition := pg_catalog.regexp_replace(
      v_fk.constraint_definition,
      '[[:space:]]+NOT VALID[[:space:]]*$',
      '',
      'i'
    );
    IF pg_catalog.strpos(v_new_fk_definition, 'REFERENCES chat.') = 0 THEN
      RAISE EXCEPTION 'Could not rewrite foreign key %.% constraint %',
        v_fk.child_schema, v_fk.child_table, v_fk.constraint_name;
    END IF;
    v_new_fk_definition := pg_catalog.replace(
      v_new_fk_definition,
      'REFERENCES chat.',
      'REFERENCES afuchat.'
    );
    v_temporary_name := 'afuchat_cutover_fk_' || v_fk.constraint_oid::text;

    EXECUTE pg_catalog.format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I %s NOT VALID',
      v_fk.child_schema,
      v_fk.child_table,
      v_temporary_name,
      v_new_fk_definition
    );

    v_validated := false;
    BEGIN
      EXECUTE pg_catalog.format(
        'ALTER TABLE %I.%I VALIDATE CONSTRAINT %I',
        v_fk.child_schema,
        v_fk.child_table,
        v_temporary_name
      );
      v_validated := true;
    EXCEPTION
      WHEN foreign_key_violation THEN
        EXECUTE pg_catalog.format(
          'ALTER TABLE %I.%I DROP CONSTRAINT %I',
          v_fk.child_schema,
          v_fk.child_table,
          v_temporary_name
        );
        IF v_fk.child_schema = 'platform'
           AND v_fk.child_table = 'notification_events'
           AND v_fk.parent_table = 'messages' THEN
          RAISE WARNING
            'Retaining platform.notification_events rows with unresolved message IDs; their legacy FK will be explicitly removed';
        ELSE
          RAISE;
        END IF;
    END;

    IF v_validated THEN
      EXECUTE pg_catalog.format(
        'ALTER TABLE %I.%I DROP CONSTRAINT %I',
        v_fk.child_schema,
        v_fk.child_table,
        v_fk.constraint_name
      );
      EXECUTE pg_catalog.format(
        'ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
        v_fk.child_schema,
        v_fk.child_table,
        v_temporary_name,
        v_fk.constraint_name
      );
    END IF;
  END LOOP;

  -- The two known platform notification rows have no AfuChat message parent.
  -- Preserve those external rows and remove only their now-invalid FK below.
  -- Any other unretargeted external FK aborts the cutover.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class child ON child.oid = con.conrelid
    JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class parent ON parent.oid = con.confrelid
    JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE con.contype = 'f'
      AND parent_ns.nspname = 'chat'
      AND child_ns.nspname <> 'chat'
      AND NOT (
        child_ns.nspname = 'platform'
        AND child.relname = 'notification_events'
        AND con.conname = 'notification_events_message_id_fkey'
        AND parent.relname = 'messages'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected external foreign keys still reference chat.*';
  END IF;

  -- Check common source and catalog dependencies explicitly; RESTRICT on the
  -- final drop also blocks any external dependency not covered by these checks.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_class target ON target.oid = d.refobjid
    JOIN pg_catalog.pg_namespace target_ns ON target_ns.oid = target.relnamespace
    JOIN pg_catalog.pg_rewrite rw
      ON d.classid = 'pg_catalog.pg_rewrite'::regclass
     AND rw.oid = d.objid
    JOIN pg_catalog.pg_class dependent ON dependent.oid = rw.ev_class
    JOIN pg_catalog.pg_namespace dependent_ns ON dependent_ns.oid = dependent.relnamespace
    WHERE target_ns.nspname = 'chat'
      AND dependent_ns.nspname <> 'chat'
  ) THEN
    RAISE EXCEPTION 'An external view still depends on the legacy chat schema';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_class target ON target.oid = d.refobjid
    JOIN pg_catalog.pg_namespace target_ns ON target_ns.oid = target.relnamespace
    JOIN pg_catalog.pg_proc dependent ON dependent.oid = d.objid
    JOIN pg_catalog.pg_namespace dependent_ns ON dependent_ns.oid = dependent.pronamespace
    WHERE d.classid = 'pg_catalog.pg_proc'::regclass
      AND target_ns.nspname = 'chat'
      AND dependent_ns.nspname <> 'chat'
  ) THEN
    RAISE EXCEPTION 'An external SQL routine still depends on the legacy chat schema';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy policy
    JOIN pg_catalog.pg_class dependent ON dependent.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace dependent_ns ON dependent_ns.oid = dependent.relnamespace
    WHERE dependent_ns.nspname <> 'chat'
      AND (
        COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '') ~ '(^|[^A-Za-z0-9_])chat\.'
        OR COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '') ~ '(^|[^A-Za-z0-9_])chat\.'
      )
  ) THEN
    RAISE EXCEPTION 'An external RLS policy still explicitly references chat.*';
  END IF;

  -- Preserve the two platform notification rows whose message IDs have no
  -- canonical parent; remove only their invalid FK, not the notification rows.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class child ON child.oid = con.conrelid
    JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class parent ON parent.oid = con.confrelid
    JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE con.contype = 'f'
      AND child_ns.nspname = 'platform'
      AND child.relname = 'notification_events'
      AND con.conname = 'notification_events_message_id_fkey'
      AND parent_ns.nspname = 'chat'
      AND parent.relname = 'messages'
  ) THEN
    EXECUTE
      'ALTER TABLE platform.notification_events DROP CONSTRAINT notification_events_message_id_fkey';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class child ON child.oid = con.conrelid
    JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class parent ON parent.oid = con.confrelid
    JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE con.contype = 'f'
      AND parent_ns.nspname = 'chat'
      AND child_ns.nspname <> 'chat'
  ) THEN
    RAISE EXCEPTION 'An external foreign key still references the legacy chat schema';
  END IF;

  IF pg_catalog.to_regnamespace('chat') IS NULL THEN
    RAISE EXCEPTION 'Legacy chat archive unexpectedly disappeared';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'can_send_chat_message',
        'can_view_chat_member',
        'chat_has_screenshot_protection',
        'count_my_groups',
        'create_channel_chat',
        'create_group_chat',
        'create_in_app_notification',
        'create_new_chat',
        'enforce_member_limit',
        'get_channel_access_context',
        'get_chat_list',
        'get_or_create_chat',
        'get_or_create_direct_chat',
        'increment_message_view_count',
        'is_channel_owner_or_admin',
        'is_chat_admin',
        'is_chat_member',
        'is_chat_owner',
        'is_chat_participant',
        'is_group_creator',
        'is_user_in_chat',
        'notify_message_reaction',
        'publish_username_market_event',
        'rejoin_group_with_admin_check',
        'send_message',
        'sync_channel_subscription_member'
      )
      AND setting LIKE 'search_path=%'
      AND setting ~ '(^|[=,[:space:]])chat([,[:space:]]|$)'
  ) THEN
    RAISE EXCEPTION 'A migrated chat routine search_path still includes chat';
  END IF;

  RAISE NOTICE 'Canonical AfuChat routines and foreign keys now use afuchat.*; legacy chat data remains archived.';
END;
$afuchat_cutover$;
