-- Record a delivery receipt only after an authenticated recipient device
-- acknowledges that it received a message or its push payload.
CREATE OR REPLACE FUNCTION public.acknowledge_message_delivery(
  p_message_ids uuid[]
)
RETURNS TABLE (
  message_id uuid,
  delivered_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_delivered_at timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_message_ids IS NULL OR cardinality(p_message_ids) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.message_status AS existing_status (message_id, user_id, delivered_at)
  SELECT DISTINCT message.id, v_user_id, v_delivered_at
  FROM public.messages AS message
  JOIN public.chat_members AS membership
    ON membership.chat_id = message.chat_id
   AND membership.user_id = v_user_id
  WHERE message.id = ANY(p_message_ids)
    AND message.sender_id <> v_user_id
  ON CONFLICT (message_id, user_id)
  DO UPDATE SET delivered_at = COALESCE(
    existing_status.delivered_at,
    EXCLUDED.delivered_at
  )
  WHERE existing_status.delivered_at IS NULL;

  RETURN QUERY
  SELECT status.message_id, status.delivered_at
  FROM public.message_status AS status
  JOIN public.messages AS message
    ON message.id = status.message_id
  JOIN public.chat_members AS membership
    ON membership.chat_id = message.chat_id
   AND membership.user_id = v_user_id
  WHERE status.user_id = v_user_id
    AND message.sender_id <> v_user_id
    AND status.message_id = ANY(p_message_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_message_delivery(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_message_delivery(uuid[]) TO authenticated;
