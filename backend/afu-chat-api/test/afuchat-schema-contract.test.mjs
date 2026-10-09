import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mobileClient = await readFile(
  new URL("../../../artifacts/mobile/lib/supabase.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../../../artifacts/mobile/supabase/migrations/20261009000000_afuchat_authoritative_chat_data.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = await readFile(
  new URL(
    "../../../artifacts/mobile/supabase/rollback/20261009000000_afuchat_authoritative_chat_data.sql",
    import.meta.url,
  ),
  "utf8",
);

test("mobile PostgREST requests are pinned to the AfuChat schema", () => {
  assert.match(mobileClient, /const AFUCHAT_SCHEMA = "afuchat"/);
  assert.match(mobileClient, /routedRequest\.headers\.set\("Accept-Profile", AFUCHAT_SCHEMA\)/);
  assert.match(mobileClient, /routedRequest\.headers\.set\("Content-Profile", AFUCHAT_SCHEMA\)/);
  assert.match(mobileClient, /schema: AFUCHAT_SCHEMA/);
});

test("chat migration reads and writes only AfuChat-owned relations", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION afuchat\.get_chat_list/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION afuchat\.get_or_create_direct_chat/);
  assert.match(migration, /other_handle text/);
  assert.match(migration, /other_member\.handle::text/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(
    migration,
    /\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:public|chat|social)\./i,
  );
  assert.match(migration, /REFERENCES afuchat\.profiles\(id\) NOT VALID/);
});

test("chat membership policies do not expose private participants or private groups", () => {
  const memberVisibility = migration.match(
    /CREATE OR REPLACE FUNCTION afuchat\.can_view_chat_member[\s\S]*?\$function\$;/,
  )?.[0];
  const publicJoinPolicy = migration.match(
    /CREATE POLICY chat_members_insert_self_or_manager[\s\S]*?;/,
  )?.[0];
  assert.ok(memberVisibility, "member-visibility function exists");
  assert.ok(publicJoinPolicy, "member insert policy exists");
  assert.match(
    memberVisibility,
    /RETURN afuchat\.is_chat_participant\(p_chat_id, p_viewer_id\)/,
  );
  assert.match(publicJoinPolicy, /NOT COALESCE\(c\.is_private, false\)/);
  assert.match(publicJoinPolicy, /COALESCE\(c\.is_group, false\).*COALESCE\(c\.is_channel, false\)/s);
  assert.match(
    migration,
    /\(COALESCE\(is_group, false\) OR COALESCE\(is_channel, false\)\)\s+AND NOT COALESCE\(is_private, false\)/,
  );
});

test("rollback preserves production records while restoring prior profile references", () => {
  assert.match(rollback, /REFERENCES accounts\.profiles\(id\).*NOT VALID/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS afuchat\.get_chat_list/);
  assert.doesNotMatch(rollback, /\b(?:DELETE FROM|TRUNCATE|UPDATE afuchat\.|INSERT INTO afuchat\.)/i);
});
