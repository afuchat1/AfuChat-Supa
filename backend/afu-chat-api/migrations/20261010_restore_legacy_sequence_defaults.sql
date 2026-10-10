-- Restores only sequence defaults that existed in the old project.
-- Each sequence is synchronized to at least the current target table maximum.
-- Existing ID values are not modified.
DO $migration$
DECLARE
  item record;
  current_max bigint;
  sequence_last bigint;
  safe_value bigint;
  sequence_ref regclass;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('engagera_api_keys', 'id', 'engagera_api_keys_id_seq'),
      ('engagera_api_logs', 'id', 'engagera_api_logs_id_seq'),
      ('engagera_conversations', 'id', 'engagera_conversations_id_seq'),
      ('engagera_dataset_candidates', 'id', 'engagera_dataset_candidates_id_seq'),
      ('engagera_dataset_versions', 'id', 'engagera_dataset_versions_id_seq'),
      ('engagera_knowledge_base', 'id', 'engagera_knowledge_base_id_seq'),
      ('engagera_messages', 'id', 'engagera_messages_id_seq'),
      ('engagera_model_registry', 'id', 'engagera_model_registry_id_seq'),
      ('engagera_request_logs', 'id', 'engagera_request_logs_id_seq'),
      ('engagera_reviewer_logs', 'id', 'engagera_reviewer_logs_id_seq'),
      ('engagera_training_jobs', 'id', 'engagera_training_jobs_id_seq'),
      ('engagera_usage_records', 'id', 'engagera_usage_records_id_seq'),
      ('support_tickets', 'ticket_number', 'support_tickets_ticket_number_seq')
    ) AS missing_defaults(table_name, column_name, sequence_name)
  LOOP
    sequence_ref := to_regclass(format('afuchat.%I', item.sequence_name));
    IF sequence_ref IS NULL THEN
      RAISE EXCEPTION 'Required target sequence is missing: afuchat.%', item.sequence_name;
    END IF;

    EXECUTE format(
      'LOCK TABLE afuchat.%I IN ACCESS EXCLUSIVE MODE',
      item.table_name
    );
    EXECUTE format(
      'SELECT max(%I)::bigint FROM afuchat.%I',
      item.column_name,
      item.table_name
    ) INTO current_max;

    SELECT last_value
    INTO sequence_last
    FROM pg_sequences
    WHERE schemaname = 'afuchat'
      AND sequencename = item.sequence_name;

    safe_value := GREATEST(COALESCE(current_max, 0), COALESCE(sequence_last, 0));
    IF safe_value > 0 THEN
      PERFORM setval(sequence_ref, safe_value, true);
    ELSE
      PERFORM setval(sequence_ref, 1, false);
    END IF;

    EXECUTE format(
      'ALTER SEQUENCE afuchat.%I OWNED BY afuchat.%I.%I',
      item.sequence_name,
      item.table_name,
      item.column_name
    );
    EXECUTE format(
      'ALTER TABLE afuchat.%I ALTER COLUMN %I SET DEFAULT nextval(%L::regclass)',
      item.table_name,
      item.column_name,
      format('afuchat.%s', item.sequence_name)
    );
  END LOOP;
END;
$migration$;
