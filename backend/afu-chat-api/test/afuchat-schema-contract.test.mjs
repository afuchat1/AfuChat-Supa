import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  RELATION_SCHEMA_BY_NAME,
  RPC_SCHEMA_BY_NAME,
  schemaForPostgrestPath,
  schemaForRelation,
  schemaForRpc,
} from "../src/data-schema.ts";
import {
  applyProfileJoinPlans,
  rewriteCrossSchemaProfileSelect,
} from "../src/profile-join-bridge.ts";

const mobileClient = await readFile(
  new URL("../../../artifacts/mobile/lib/supabase.ts", import.meta.url),
  "utf8",
);
const mobileRoot = fileURLToPath(new URL("../../../artifacts/mobile/", import.meta.url));

async function collectMobileSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (["node_modules", ".expo", "dist", "build", "android", "ios"].includes(entry.name)) {
        continue;
      }
      files.push(...await collectMobileSourceFiles(join(directory, entry.name)));
    } else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

test("only explicit AfuChat resources and referenced external resources are routable", () => {
  assert.equal(schemaForRelation("chats"), "afuchat");
  assert.equal(schemaForRelation("shop_orders"), "afuchat");
  assert.equal(schemaForRelation("shop_order_items"), "afuchat");
  assert.equal(schemaForRelation("profiles"), "accounts");
  assert.equal(schemaForRelation("verification_requests"), "accounts");
  assert.equal(schemaForRelation("orders"), null);
  assert.equal(schemaForRelation("posts"), "afuchat");

  for (const absent of ["app_banners", "business_verification_requests", "org_page_jobs"]) {
    assert.equal(schemaForRelation(absent), null);
    assert.equal(Object.hasOwn(RELATION_SCHEMA_BY_NAME, absent), false);
  }
  assert.equal(schemaForRelation("blocks"), null);
  assert.equal(schemaForRelation("life_earth_leaderboard"), null);
});

test("the RPC registry contains only production-confirmed AfuChat functions", () => {
  assert.deepEqual(RPC_SCHEMA_BY_NAME, {
    get_chat_list: "afuchat",
    get_or_create_direct_chat: "afuchat",
  });
  assert.equal(schemaForRpc("credit_acoin"), null);
  assert.equal(schemaForRpc("nearby_users"), null);
  assert.equal(schemaForPostgrestPath("/rest/v1/rpc/get_chat_list"), "afuchat");
  assert.equal(schemaForPostgrestPath("/rest/v1/rpc/credit_acoin"), null);
});

test("mobile routes only explicit external references outside the AfuChat schema", () => {
  assert.match(mobileClient, /profiles:\s*"accounts"/);
  assert.match(mobileClient, /verification_requests:\s*"accounts"/);
  assert.doesNotMatch(mobileClient, /posts:\s*"social"/);
  assert.match(mobileClient, /routedRequest\.headers\.set\("Accept-Profile", schema\)/);
  assert.match(mobileClient, /routedRequest\.headers\.set\("Content-Profile", schema\)/);
});

test("all literal mobile PostgREST resources are registered with the API gateway", async () => {
  const resources = new Map();
  const fromCall = /\.from\(\s*["']([a-z][a-z0-9_]*)["']\s*\)/g;
  for (const file of await collectMobileSourceFiles(mobileRoot)) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(fromCall)) {
      const prefix = source.slice(Math.max(0, match.index - 40), match.index);
      if (/\.storage\.$/.test(prefix)) continue;
      const paths = resources.get(match[1]) ?? [];
      paths.push(file);
      resources.set(match[1], paths);
    }
  }

  assert.ok(resources.size > 0, "expected to find literal mobile table references");
  const unregistered = [...resources.entries()]
    .filter(([relation]) => schemaForRelation(relation) === null)
    .map(([relation, files]) => `${relation}: ${files.join(", ")}`);
  assert.deepEqual(unregistered, []);
});

test("mobile PostgREST traffic uses the AfuChat API while auth and realtime keep the shared client", () => {
  assert.match(mobileClient, /const gatewayUrl = new URL\(\s*`\/v1\/chat\/data/);
  assert.match(mobileClient, /global:\s*\{\s*fetch:\s*fetchThroughAfuChatApi/);
  assert.match(mobileClient, /const supabaseClientUrl = SUPABASE_URL/);
});

test("cross-schema account profile embeds are split into an RLS-preserving profile lookup", () => {
  const result = rewriteCrossSchemaProfileSelect(
    "afuchat",
    "id,sender_id,profiles!gift_transactions_sender_id_fkey(display_name)",
  );
  assert.deepEqual(result, {
    selector: "id,sender_id",
    plans: [{
      parentPath: [],
      foreignKeyColumn: "sender_id",
      alias: "profiles",
      fields: "display_name",
      outputKeys: ["display_name"],
      inner: false,
      schema: "accounts",
    }],
    unsupported: false,
  });

  const nested = rewriteCrossSchemaProfileSelect(
    "afuchat",
    "id,buyer:profiles!shop_orders_buyer_id_fkey(display_name,handle)",
  );
  assert.equal(
    nested?.selector,
    "id,buyer_id",
  );
  assert.deepEqual(nested?.plans[0]?.parentPath, []);
  assert.equal(nested?.plans[0]?.foreignKeyColumn, "buyer_id");
});

test("same-schema chat profile embeds remain untouched and unsupported inner joins fail closed", () => {
  const chat = "id,chat_members!inner(user_id,profiles!chat_members_user_id_fkey(display_name))";
  const unchanged = rewriteCrossSchemaProfileSelect("afuchat", chat);
  assert.equal(unchanged?.selector, chat);
  assert.deepEqual(unchanged?.plans, []);

  const inner = rewriteCrossSchemaProfileSelect(
    "afuchat",
    "id,buyer:profiles!shop_orders_buyer_id_fkey!inner(display_name)",
  );
  assert.equal(inner?.unsupported, true);
});

test("hydrated profiles preserve the requested projection and nested relationship shape", () => {
  const rewritten = rewriteCrossSchemaProfileSelect(
    "afuchat",
    "id,buyer_id,buyer:profiles!shop_orders_buyer_id_fkey(display_name,handle)",
  );
  assert.ok(rewritten);
  const payload = [{
    id: "order-1",
    buyer_id: "11111111-1111-4111-8111-111111111111",
  }];
  applyProfileJoinPlans(payload, rewritten.plans, new Map([[
    "11111111-1111-4111-8111-111111111111",
    {
      id: "11111111-1111-4111-8111-111111111111",
      display_name: "Ada",
      handle: "ada",
      email: "not-selected@example.test",
    },
  ]]));
  assert.deepEqual(payload[0].buyer, { display_name: "Ada", handle: "ada" });
});
