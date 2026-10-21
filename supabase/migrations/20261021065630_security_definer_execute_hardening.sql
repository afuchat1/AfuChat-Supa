-- Restrict high-impact SECURITY DEFINER RPCs to authenticated callers or trusted server code.
REVOKE ALL ON FUNCTION public.admin_ban_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_process_withdrawal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_withdrawal(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_remove_warning(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_warning(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_unban_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_warn_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warn_user(uuid, text) TO authenticated;

-- Wallet crediting must only be callable by trusted server-side code.
REVOKE ALL ON FUNCTION public.credit_acoin(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_acoin(uuid, integer) TO service_role;

-- These user-facing mutations rely on auth.uid(); do not expose them to anonymous sessions.
REVOKE ALL ON FUNCTION public.award_xp(uuid, text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_red_envelope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_red_envelope(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_red_envelope(integer, integer, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_red_envelope(integer, integer, text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_new_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_new_chat(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_group_chat(text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, text, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.add_group_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_group_members(uuid, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_my_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_subscription() TO authenticated;
REVOKE ALL ON FUNCTION public.convert_nexa_to_acoin(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_nexa_to_acoin(integer) TO authenticated;

-- Do not allow authenticated users to award XP to another account.
CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id uuid,
  p_action_type text,
  p_xp_amount integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_new_balance integer;
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;
  IF auth.role() <> 'service_role' AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cannot_award_other_users');
  END IF;
  IF p_xp_amount IS NULL OR p_xp_amount <= 0 OR p_xp_amount > 1000 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_xp_amount');
  END IF;
  UPDATE public.profiles
  SET xp = COALESCE(xp, 0) + p_xp_amount
  WHERE id = p_user_id
  RETURNING xp INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'user_not_found');
  END IF;
  INSERT INTO public.xp_activity_log (user_id, activity_type, xp_amount, metadata)
  VALUES (p_user_id, p_action_type, p_xp_amount, COALESCE(p_metadata, '{}'::jsonb));
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$;
