-- Apply the same semantics-preserving auth initplan optimization to any
-- remaining public-schema RLS policies. Policies already using scalar
-- subqueries are left untouched.
DO $$
DECLARE
  pol record;
  role_list text;
  new_qual text;
  new_check text;
  statement text;
  changed_count integer := 0;
BEGIN
  FOR pol IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
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
      pol.policyname, pol.schemaname, pol.tablename,
      pol.permissive, pol.cmd, role_list,
      CASE WHEN new_qual IS NULL THEN '' ELSE format(' USING (%s)', new_qual) END,
      CASE WHEN new_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', new_check) END
    );
    EXECUTE statement;
    changed_count := changed_count + 1;
  END LOOP;
  RAISE NOTICE 'Optimized % remaining public-schema policies', changed_count;
END
$$;

NOTIFY pgrst, 'reload schema';