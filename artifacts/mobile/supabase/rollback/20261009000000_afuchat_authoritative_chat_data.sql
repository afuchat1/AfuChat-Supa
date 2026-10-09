-- Reverses 20261009000000_afuchat_authoritative_chat_data.sql for the
-- existing production project. This restores the prior policy/FK behavior and
-- removes only helpers introduced by that migration; it does not alter rows.
BEGIN;

DROP POLICY IF EXISTS chat_members_delete_self_or_manager ON afuchat.chat_members;
DROP POLICY IF EXISTS chat_members_insert_self_or_manager ON afuchat.chat_members;
DROP POLICY IF EXISTS chat_members_select_privacy ON afuchat.chat_members;
DROP POLICY IF EXISTS chat_members_update_manager ON afuchat.chat_members;
DROP POLICY IF EXISTS "Admins can update group chats" ON afuchat.chats;
DROP POLICY IF EXISTS chats_select_public_or_member ON afuchat.chats;
DROP POLICY IF EXISTS chats_manage_owner ON afuchat.chats;
DROP POLICY IF EXISTS messages_insert_member_sender ON afuchat.messages;
DROP POLICY IF EXISTS messages_select_member ON afuchat.messages;

ALTER TABLE afuchat.chat_members
  DROP CONSTRAINT IF EXISTS chat_members_user_id_fkey;
ALTER TABLE afuchat.chat_members
  ADD CONSTRAINT chat_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES accounts.profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE afuchat.chats
  DROP CONSTRAINT IF EXISTS chats_created_by_fkey;
ALTER TABLE afuchat.chats
  ADD CONSTRAINT chats_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES accounts.profiles(id) NOT VALID;

ALTER TABLE afuchat.messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE afuchat.messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES accounts.profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE afuchat.message_status
  DROP CONSTRAINT IF EXISTS message_status_user_id_fkey;
ALTER TABLE afuchat.message_status
  ADD CONSTRAINT message_status_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES accounts.profiles(id) ON DELETE CASCADE NOT VALID;

DROP FUNCTION IF EXISTS afuchat.get_chat_list(uuid[]);
DROP FUNCTION IF EXISTS afuchat.get_or_create_direct_chat(uuid);
DROP FUNCTION IF EXISTS afuchat.can_view_chat_member(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS afuchat.can_send_chat_message(uuid, uuid);
DROP FUNCTION IF EXISTS afuchat.is_channel_owner_or_admin(uuid, uuid);
DROP FUNCTION IF EXISTS afuchat.is_chat_owner(uuid, uuid);
DROP FUNCTION IF EXISTS afuchat.is_chat_admin(uuid, uuid);
DROP FUNCTION IF EXISTS afuchat.is_chat_participant(uuid, uuid);

NOTIFY pgrst, 'reload schema';
COMMIT;
