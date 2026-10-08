-- Canonical AfuChat database cutover.
-- Deploy the updated afu-chat-api Worker before applying this migration.
-- The project owner explicitly authorized dropping the legacy chat schema and
-- accepted data loss within it. This migration does not copy or re-key rows.
-- External rows remain; valid foreign keys are rebound to AfuChat.
--
-- The whole cutover is one DO statement so any failed check rolls back all
-- routine changes, foreign-key changes, and the schema drop together.
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
  -- Keep existing signatures, return types, owners, grants, and security
  -- attributes. Only change explicitly qualified chat-schema references.
  FOR v_routine IN
    SELECT p.oid
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname <> 'chat'
      AND p.prokind IN ('f', 'p')
      AND p.prosrc ~ '(^|[^A-Za-z0-9_])chat\.'
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

  -- Remove the one explicitly approved, invalid external FK. Use RESTRICT for
  -- the schema drop so an overlooked external dependency aborts and rolls back
  -- instead of silently cascading into another schema.
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

  EXECUTE 'DROP SCHEMA IF EXISTS chat RESTRICT';

  IF pg_catalog.to_regnamespace('chat') IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy chat schema still exists after cutover';
  END IF;
END;
$afuchat_cutover$;
