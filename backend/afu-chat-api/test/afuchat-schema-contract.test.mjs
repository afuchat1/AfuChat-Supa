import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("only explicit AfuChat resources and referenced external resources are routable", () => {
  assert.equal(schemaForRelation("chats"), "afuchat");
  assert.equal(schemaForRelation("shop_orders"), "afuchat");
  assert.equal(schemaForRelation("profiles"), "accounts");
  assert.equal(schemaForRelation("orders"), "shop");
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
  assert.match(mobileClient, /orders:\s*"shop"/);
  assert.doesNotMatch(mobileClient, /posts:\s*"social"/);
  assert.match(mobileClient, /routedRequest\.headers\.set\("Accept-Profile", schema\)/);
  assert.match(mobileClient, /routedRequest\.headers\.set\("Content-Profile", schema\)/);
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
    "id,shops!shop_products_shop_id_fkey(id,seller_id,profiles!shops_seller_id_fkey(display_name,handle))",
  );
  assert.equal(
    nested?.selector,
    "id,shops!shop_products_shop_id_fkey(id,seller_id)",
  );
  assert.deepEqual(nested?.plans[0]?.parentPath, ["shops"]);
  assert.equal(nested?.plans[0]?.foreignKeyColumn, "seller_id");
});

test("same-schema chat profile embeds remain untouched and unsupported inner joins fail closed", () => {
  const chat = "id,chat_members!inner(user_id,profiles!chat_members_user_id_fkey(display_name))";
  const unchanged = rewriteCrossSchemaProfileSelect("afuchat", chat);
  assert.equal(unchanged?.selector, chat);
  assert.deepEqual(unchanged?.plans, []);

  const inner = rewriteCrossSchemaProfileSelect(
    "afuchat",
    "id,buyer:profiles!orders_buyer_id_fkey!inner(display_name)",
  );
  assert.equal(inner?.unsupported, true);
});

test("hydrated profiles preserve the requested projection and nested relationship shape", () => {
  const rewritten = rewriteCrossSchemaProfileSelect(
    "afuchat",
    "id,shops!shop_products_shop_id_fkey(id,seller_id,seller:profiles!shops_seller_id_fkey(display_name,handle))",
  );
  assert.ok(rewritten);
  const payload = [{
    id: "product-1",
    shops: {
      id: "shop-1",
      seller_id: "11111111-1111-4111-8111-111111111111",
    },
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
  assert.deepEqual(payload[0].shops.seller, { display_name: "Ada", handle: "ada" });
});
