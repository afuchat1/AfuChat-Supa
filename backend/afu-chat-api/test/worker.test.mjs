import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.ts";

const originalFetch = globalThis.fetch;
const excludedChatId = "123e4567-e89b-42d3-a456-426614174000";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeEnv(authStatus = 200) {
  return {
    AFUCHAT_SUPABASE_URL: "https://supabase.example.test",
    AFUCHAT_SUPABASE_ANON_KEY: "test-anon-key",
    AFUCHAT_DATABASE_SCHEMA: "public",
    AFUAUTH_API: {
      fetch: async () => Response.json(
        authStatus === 200
          ? { user: { id: "user-123" }, accessToken: "shared-session" }
          : { error: "Invalid or expired Supabase session" },
        { status: authStatus },
      ),
    },
  };
}

test("chat health endpoint is public", async () => {
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/healthz"),
    makeEnv(),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).worker, "afuchat-api");
});

test("conversation endpoint requires a bearer token", async () => {
  const env = makeEnv();
  let authCalls = 0;
  env.AFUAUTH_API.fetch = async () => {
    authCalls += 1;
    return Response.json({ user: { id: "user-123" } });
  };
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/conversations"),
    env,
  );
  assert.equal(response.status, 401);
  assert.equal(authCalls, 0);
});

test("conversation endpoint verifies identity and forwards the same Supabase token to RLS", async () => {
  const token = "same-supabase-session";
  const env = makeEnv();
  let authCalls = 0;
  env.AFUAUTH_API.fetch = async (request) => {
    authCalls += 1;
    assert.equal(new URL(request.url).pathname, "/v1/auth/session");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    return Response.json({ user: { id: "user-123" }, accessToken: token });
  };

  let rpcRequest;
  globalThis.fetch = async (input) => {
    rpcRequest = input;
    return Response.json([{ chat_id: "chat-1" }]);
  };
  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/conversations?unread_excluded_ids=${excludedChatId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "https://afuchat.com",
        },
      },
    ),
    env,
  );

  assert.equal(authCalls, 1);
  assert.equal(new URL(rpcRequest.url).pathname, "/rest/v1/rpc/get_chat_list");
  assert.equal(rpcRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(rpcRequest.headers.get("Accept-Profile"), "public");
  assert.deepEqual(await rpcRequest.json(), {
    p_unread_excluded_ids: [excludedChatId],
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://afuchat.com");
  assert.deepEqual(await response.json(), [{ chat_id: "chat-1" }]);
});

test("conversation endpoint rejects invalid sessions before querying chat data", async () => {
  const env = makeEnv(401);
  let rpcCalls = 0;
  globalThis.fetch = async () => {
    rpcCalls += 1;
    return Response.json([]);
  };
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/conversations", {
      headers: { Authorization: "Bearer expired-session" },
    }),
    env,
  );
  assert.equal(response.status, 401);
  assert.equal(rpcCalls, 0);
});

test("conversation endpoint rejects malformed excluded chat IDs", async () => {
  const env = makeEnv();
  let authCalls = 0;
  env.AFUAUTH_API.fetch = async () => {
    authCalls += 1;
    return Response.json({ user: { id: "user-123" } });
  };
  const response = await worker.fetch(
    new Request(
      "https://api.afuchat.com/v1/chat/conversations?unread_excluded_ids=not-a-uuid",
      { headers: { Authorization: "Bearer valid-session" } },
    ),
    env,
  );
  assert.equal(response.status, 400);
  assert.equal(authCalls, 0);
});
