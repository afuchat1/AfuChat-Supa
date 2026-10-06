import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.ts";
import mediaHandler from "../../../artifacts/afuchat-worker/src/index.ts";
import {
  isChatStoragePath,
  isCompatibilityStoragePath,
  toChatStoragePath,
  toChatStorageRequest,
} from "../src/storage-routing.ts";
import { createAfuChatWorkerRouter } from "../src/worker-router.ts";

const originalFetch = globalThis.fetch;
const excludedChatId = "123e4567-e89b-42d3-a456-426614174000";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeEnv(authStatus = 200) {
  return {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_ANON_KEY: "test-anon-key",
    AFUCHAT_DATABASE_SCHEMA: "public",
    AFUAUTH_API: {
      async fetch(input) {
        const request = input instanceof Request ? input : new Request(input);
        if (authStatus !== 200) {
          return Response.json({ error: "Invalid token" }, { status: authStatus });
        }
        const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        return Response.json({ user: { id: "user-123" }, accessToken: token });
      },
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

test("API compatibility and CDN assets share the chat path without host collisions", async () => {
  const apiResponse = await mediaHandler.fetch(
    new Request("https://api.afuchat.com/chat/v1/storage/usage"),
    makeEnv(),
  );
  assert.equal(apiResponse.status, 401);
  assert.equal((await apiResponse.json()).error, "Authentication required");

  const cdnResponse = await mediaHandler.fetch(
    new Request("https://cdn.afuchat.com/chat/__deployment_probe__"),
    makeEnv(),
  );
  assert.equal(cdnResponse.status, 400);
  assert.equal((await cdnResponse.json()).error, "Invalid storage key");
});

test("canonical chat storage routes map to the existing media handler", () => {
  const cases = [
    ["/v1/chat/storage/usage", "/chat/v1/storage/usage"],
    ["/v1/chat/storage/containers", "/chat/v1/storage-containers"],
    [
      "/v1/chat/storage/containers/media-bucket/upload",
      "/chat/v1/storage-containers/media-bucket/upload",
    ],
    [
      "/v1/chat/storage/containers/media-bucket/objects/confirm",
      "/chat/v1/storage-containers/media-bucket/objects/confirm",
    ],
    [
      "/v1/chat/storage/objects/containers/user-id/media-bucket/photo.jpg",
      "/chat/v1/storage/containers/user-id/media-bucket/photo.jpg",
    ],
  ];

  for (const [path, expected] of cases) {
    assert.equal(isChatStoragePath(path), true);
    assert.equal(toChatStoragePath(path), expected);
  }
  assert.equal(isChatStoragePath("/v1/chat/posts"), false);
  assert.equal(toChatStoragePath("/v1/chat/storage/unknown"), null);
});

test("canonical storage request preserves query, method, and authorization", async () => {
  const request = new Request(
    "https://api.afuchat.com/v1/chat/storage/containers/media-bucket/upload?name=photo.jpg",
    {
      method: "POST",
      headers: { Authorization: "Bearer upload-session", "Content-Type": "image/jpeg" },
      body: "image-bytes",
    },
  );
  const rewritten = toChatStorageRequest(request);

  assert.ok(rewritten);
  assert.equal(
    new URL(rewritten.url).pathname,
    "/chat/v1/storage-containers/media-bucket/upload",
  );
  assert.equal(new URL(rewritten.url).search, "?name=photo.jpg");
  assert.equal(rewritten.method, "POST");
  assert.equal(rewritten.headers.get("Authorization"), "Bearer upload-session");
  assert.equal(await rewritten.text(), "image-bytes");
});

test("old storage paths are recognized only as compatibility routes", () => {
  assert.equal(isCompatibilityStoragePath("/v1/storage/usage"), true);
  assert.equal(isCompatibilityStoragePath("/v1/storage-containers"), true);
  assert.equal(isCompatibilityStoragePath("/v1/chat/storage/usage"), false);
  assert.equal(isCompatibilityStoragePath("/v1/cloud/storage/usage"), false);
});

test("deployment router sends canonical storage to the media handler and chat API to chat", async () => {
  const calls = [];
  const chatApi = {
    fetch: async (request) => {
      calls.push({ handler: "chat", path: new URL(request.url).pathname });
      return new Response("chat");
    },
  };
  const legacyApi = {
    fetch: async (request) => {
      calls.push({ handler: "media", path: new URL(request.url).pathname });
      return new Response("media");
    },
  };
  const router = createAfuChatWorkerRouter(chatApi, legacyApi);

  await router.fetch(new Request("https://api.afuchat.com/v1/chat/storage/usage"), {}, {});
  await router.fetch(new Request("https://api.afuchat.com/chat/v1/storage/usage"), {}, {});
  await router.fetch(new Request("https://api.afuchat.com/v1/chat/conversations"), {}, {});
  await router.fetch(new Request("https://api.afuchat.com/v1/storage/usage"), {}, {});

  assert.deepEqual(calls, [
    { handler: "media", path: "/chat/v1/storage/usage" },
    { handler: "media", path: "/chat/v1/storage/usage" },
    { handler: "chat", path: "/v1/chat/conversations" },
    { handler: "media", path: "/chat/v1/storage/usage" },
  ]);
});

test("AfuChat status reports the live Supabase check", async () => {
  let checkedUrl = "";
  globalThis.fetch = async (input) => {
    checkedUrl = String(input);
    return Response.json([{ id: "profile-1" }]);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/status"),
    makeEnv(),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    checkedUrl,
    "https://supabase.example.test/rest/v1/profiles?select=id&limit=1",
  );
  assert.equal(payload.ok, true);
  assert.equal(payload.worker, "afuchat-api");
  assert.equal(payload.services.supabase.ok, true);
});

test("account export verifies AfuAuth and sends only the selected export to the signed-in email", async () => {
  const token = "account-export-session";
  const env = makeEnv();
  env.RESEND_API_KEY = "test-resend-key";
  env.AFUAUTH_API.fetch = async () =>
    Response.json({
      user: { id: "user-123", email: "user@example.test" },
      accessToken: token,
    });
  let resendPayload;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (new URL(request.url).hostname === "supabase.example.test") {
      assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
      assert.equal(new URL(request.url).pathname, "/rest/v1/profiles");
      return Response.json([{ id: "user-123", display_name: "Test User" }]);
    }
    assert.equal(new URL(request.url).hostname, "api.resend.com");
    resendPayload = await request.json();
    return Response.json({ id: "email-1" });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/account/export", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ types: ["profile", "unknown"] }),
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, email: "user@example.test" });
  assert.deepEqual(resendPayload.to, ["user@example.test"]);
  assert.deepEqual(resendPayload.attachments.map((attachment) => attachment.filename), [
    "afuchat-data-export-2026-10-06.json",
  ]);
  const exported = JSON.parse(atob(resendPayload.attachments[0].content));
  assert.deepEqual(exported.included_types, ["profile"]);
  assert.equal(exported.data.profile.display_name, "Test User");
});

test("account export fails closed when email delivery is not configured", async () => {
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({
      user: { id: "user-123", email: "user@example.test" },
      accessToken: "valid-session",
    });
  let databaseCalls = 0;
  globalThis.fetch = async () => {
    databaseCalls += 1;
    return Response.json([]);
  };
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/account/export", {
      method: "POST",
      headers: { Authorization: "Bearer valid-session" },
      body: JSON.stringify({ types: ["profile"] }),
    }),
    env,
  );
  assert.equal(response.status, 503);
  assert.equal(databaseCalls, 0);
});

test("Pesapal initiation verifies the shared session and reports missing notification configuration", async () => {
  const env = makeEnv();
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json({});
  };
  const unauthenticated = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/payments/pesapal-initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acoin_amount: 500 }),
    }),
    env,
  );
  assert.equal(unauthenticated.status, 401);

  env.AFUAUTH_API.fetch = async () =>
    Response.json({
      user: { id: "user-123", email: "user@example.test" },
      accessToken: "valid-session",
    });
  const missingIpn = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/payments/pesapal-initiate", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ acoin_amount: 500 }),
    }),
    env,
  );
  assert.equal(missingIpn.status, 503);
  assert.equal(providerCalls, 0);
});

test("video route reports its explicit unconfigured state", async () => {
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/videos"),
    makeEnv(),
  );
  assert.equal(response.status, 501);
  assert.match((await response.json()).error, /original video remains available/);
});

test("conversation endpoint requires a bearer token", async () => {
  const env = makeEnv();
  let authCalls = 0;
  env.AFUAUTH_API.fetch = async () => {
    authCalls += 1;
    return Response.json({ id: "user-123" });
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
  let authRequest;
  let rpcRequest;
  env.AFUAUTH_API.fetch = async (input) => {
    authRequest = input instanceof Request ? input : new Request(input);
    return Response.json({ user: { id: "user-123" }, accessToken: token });
  };
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    rpcRequest = request;
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

  assert.equal(new URL(authRequest.url).pathname, "/v1/auth/session");
  assert.equal(authRequest.method, "POST");
  assert.equal(authRequest.headers.get("Authorization"), `Bearer ${token}`);
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
    return Response.json({ id: "user-123" });
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

test("conversation endpoint fails closed when Supabase is not configured", async () => {
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/conversations", {
      headers: { Authorization: "Bearer valid-session" },
    }),
    {},
  );
  assert.equal(response.status, 503);
});

test("conversation endpoint fails closed when AfuAuth service binding is missing", async () => {
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/conversations", {
      headers: { Authorization: "Bearer valid-session" },
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_ANON_KEY: "test-anon-key",
      AFUCHAT_DATABASE_SCHEMA: "public",
    },
  );
  assert.equal(response.status, 503);
});

test("conversation endpoint rejects a session response that changes the shared token", async () => {
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: "different-token" });
  let rpcCalls = 0;
  globalThis.fetch = async () => {
    rpcCalls += 1;
    return Response.json([]);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/conversations", {
      headers: { Authorization: "Bearer original-token" },
    }),
    env,
  );
  assert.equal(response.status, 503);
  assert.equal(rpcCalls, 0);
});
