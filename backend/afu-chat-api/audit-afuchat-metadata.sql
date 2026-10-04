-- Read-only inventory for the AfuChat schema migration.
-- Run each SELECT in Supabase SQL Editor. This file performs no writes.

-- 1. Current public RPC definitions called by the mobile client, including
-- overloads, security mode, function configuration, and execution grants.
WITH client_rpc(name) AS (
  VALUES
    ('add_group_members'),
    ('award_xp'),
    ('cancel_my_subscription'),
    ('chat_has_screenshot_protection'),
    ('check_mutual_match'),
    ('check_public_chat_username'),
    ('check_username_availability'),
    ('claim_red_envelope'),
    ('claim_username'),
    ('clear_afuai_chat'),
    ('convert_gift_to_acoin'),
    ('count_my_channels'),
    ('count_my_groups'),
    ('create_channel_chat'),
    ('create_group_chat'),
    ('create_red_envelope'),
    ('create_username_listing'),
    ('credit_acoin'),
    ('deduct_acoin'),
    ('delist_username_listing'),
    ('feature_username_listing'),
    ('get_channel_access_context'),
    ('get_chat_list'),
    ('get_my_channels'),
    ('get_or_create_direct_chat'),
    ('increment_channel_subscriber'),
    ('insert_afuai_message'),
    ('lookup_profile_by_afu_id'),
    ('nearby_users'),
    ('place_username_bid'),
    ('purchase_music_track'),
    ('purchase_status_good'),
    ('purchase_username'),
    ('reward_activity_xp'),
    ('send_afu_ai_welcome'),
    ('update_last_seen'),
    ('upsert_watch_history')
)
SELECT
  c.name AS requested_name,
  CASE WHEN p.oid IS NULL THEN 'MISSING' ELSE p.oid::regprocedure::text END AS signature,
  n.nspname AS function_schema,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  pg_get_userbyid(p.proowner) AS owner_name,
  CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon_can_execute,
  CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS authenticated_can_execute,
  pg_get_functiondef(p.oid) AS function_definition
FROM client_rpc c
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = c.name
ORDER BY c.name, signature;

-- 2. Cross-schema foreign keys to or from afuchat, with exact column pairs.
SELECT
  c.conname AS constraint_name,
  source_ns.nspname AS source_schema,
  source_table.relname AS source_table,
  source_columns.names AS source_columns,
  target_ns.nspname AS target_schema,
  target_table.relname AS target_table,
  target_columns.names AS target_columns,
  c.convalidated AS validated,
  pg_get_constraintdef(c.oid, true) AS definition
FROM pg_constraint c
JOIN pg_class source_table ON source_table.oid = c.conrelid
JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
JOIN pg_class target_table ON target_table.oid = c.confrelid
JOIN pg_namespace target_ns ON target_ns.oid = target_table.relnamespace
CROSS JOIN LATERAL (
  SELECT array_agg(a.attname ORDER BY k.ord) AS names
  FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
  JOIN pg_attribute a ON a.attrelid = source_table.oid AND a.attnum = k.attnum
) source_columns
CROSS JOIN LATERAL (
  SELECT array_agg(a.attname ORDER BY k.ord) AS names
  FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
  JOIN pg_attribute a ON a.attrelid = target_table.oid AND a.attnum = k.attnum
) target_columns
WHERE c.contype = 'f'
  AND source_ns.nspname <> target_ns.nspname
  AND (source_ns.nspname = 'afuchat' OR target_ns.nspname = 'afuchat')
ORDER BY source_ns.nspname, source_table.relname, c.conname;