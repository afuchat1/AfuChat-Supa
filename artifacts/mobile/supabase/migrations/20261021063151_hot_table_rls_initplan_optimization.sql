-- Avoid per-row auth.uid()/auth.role() evaluation in high-traffic RLS policies.
-- Recreate only policies on measured hot tables; policy roles, commands, modes,
-- predicates and checks are preserved byte-for-byte except for scalar subqueries.
DO $$
DECLARE
  pol record;
  role_list text;
  new_qual text;
  new_check text;
  statement text;
BEGIN
  FOR pol IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'messages', 'chat_members', 'message_status', 'chats',
        'posts', 'profiles', 'post_acknowledgments', 'post_views',
        'post_replies', 'chat_preferences', 'follows'
      )
      AND (
        coalesce(qual, '') ~* 'auth\.(uid|role)\(\)'
        OR coalesce(with_check, '') ~* 'auth\.(uid|role)\(\)'
      )
      AND coalesce(qual, '') !~* '\(\s*select\s+auth\.(uid|role)'
      AND coalesce(with_check, '') !~* '\(\s*select\s+auth\.(uid|role)'
  LOOP
    SELECT string_agg(
      CASE WHEN role_name = 'public' THEN 'PUBLIC' ELSE quote_ident(role_name) END,
      ', ' ORDER BY role_name
    )
    INTO role_list
    FROM unnest(pol.roles) AS roles(role_name);

    new_qual := CASE WHEN pol.qual IS NULL THEN NULL ELSE
      regexp_replace(
        regexp_replace(pol.qual, 'auth\.uid\(\)', '(select auth.uid())', 'gi'),
        'auth\.role\(\)', '(select auth.role())', 'gi'
      )
    END;
    new_check := CASE WHEN pol.with_check IS NULL THEN NULL ELSE
      regexp_replace(
        regexp_replace(pol.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'gi'),
        'auth\.role\(\)', '(select auth.role())', 'gi'
      )
    END;

    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    statement := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      pol.permissive,
      pol.cmd,
      role_list,
      CASE WHEN new_qual IS NULL THEN '' ELSE format(' USING (%s)', new_qual) END,
      CASE WHEN new_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', new_check) END
    );
    EXECUTE statement;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';