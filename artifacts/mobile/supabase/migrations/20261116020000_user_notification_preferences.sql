BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  message_notifications boolean NOT NULL DEFAULT true,
  call_notifications boolean NOT NULL DEFAULT true,
  social_notifications boolean NOT NULL DEFAULT true,
  commerce_notifications boolean NOT NULL DEFAULT true,
  group_notifications boolean NOT NULL DEFAULT true,
  muted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_notification_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.user_notification_preferences TO authenticated;
GRANT SELECT ON public.user_notification_preferences TO service_role;

DROP POLICY IF EXISTS user_notification_preferences_select_own
  ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_select_own
  ON public.user_notification_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notification_preferences_insert_own
  ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_insert_own
  ON public.user_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notification_preferences_update_own
  ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_update_own
  ON public.user_notification_preferences
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
