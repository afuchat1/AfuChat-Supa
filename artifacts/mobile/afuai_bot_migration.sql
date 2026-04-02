-- ============================================================
-- AfuChat — AfuAI Bot Message Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- Purpose:
--   RLS on the messages table prevents any user from inserting
--   a message with sender_id ≠ auth.uid().  We need the app to
--   save AfuAI bot replies (sender_id = AFUAI_BOT_ID) after the
--   AI responds.  A SECURITY DEFINER function runs as the DB
--   owner and bypasses RLS while still verifying the caller is
--   a real member of the target chat.
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_afuai_message(
  p_chat_id UUID,
  p_content  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
  v_bot_id     UUID := 'c7ec234e-1ae8-499c-8318-6a592c5f81bb';
BEGIN
  -- Caller must be authenticated and a member of the chat
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chat_members
    WHERE chat_id = p_chat_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this chat';
  END IF;

  -- Insert the bot reply
  INSERT INTO messages (chat_id, sender_id, encrypted_content)
  VALUES (p_chat_id, v_bot_id, p_content)
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

-- Grant call rights to every authenticated Supabase user
GRANT EXECUTE ON FUNCTION public.insert_afuai_message(UUID, TEXT) TO authenticated;
