-- Short-lived presence lets the push function avoid alerting users who are
-- already viewing the same chat. Clients refresh this row while foregrounded.
CREATE TABLE IF NOT EXISTS public.active_chat_notification_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS active_chat_notification_presence_chat_expiry_idx
  ON public.active_chat_notification_presence (chat_id, expires_at);

ALTER TABLE public.active_chat_notification_presence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.active_chat_notification_presence FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.active_chat_notification_presence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.active_chat_notification_presence TO service_role;

DROP POLICY IF EXISTS active_chat_notification_presence_own
  ON public.active_chat_notification_presence;
CREATE POLICY active_chat_notification_presence_own
  ON public.active_chat_notification_presence
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
