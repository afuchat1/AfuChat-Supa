import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.ts";
import mediaHandler from "../../../artifacts/afuchat-worker/src/index.ts";
import {
  isChatStoragePath,
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
  const payload = await response.json();
  assert.deepEqual(payload, { product: "afuchat", status: "ok", version: "v1" });
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

test("legacy product and unnamespaced storage API paths are not chat routes", () => {
  assert.equal(isChatStoragePath("/v1/storage/usage"), false);
  assert.equal(toChatStoragePath("/v1/storage/usage"), null);
  assert.equal(isChatStoragePath("/v1/cloud/storage/usage"), false);
});

test("AfuChat API router serves only API namespaces, leaving CDN delivery to afu-cdn", async () => {
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
  await router.fetch(new Request("https://api.afuchat.com/v1/chat/conversations"), {}, {});
  await router.fetch(new Request("https://api.afuchat.com/v1/chat/me"), {}, {});
  const oldApiPath = await router.fetch(
    new Request("https://api.afuchat.com/chat/v1/storage/usage"),
    {},
    {},
  );
  const oldStoragePath = await router.fetch(
    new Request("https://api.afuchat.com/v1/storage/usage"),
    {},
    {},
  );
  const cdnPath = await router.fetch(
    new Request("https://cdn.afuchat.com/chat/object.jpg"),
    {},
    {},
  );
  const wrongCdnPrefix = await router.fetch(
    new Request("https://cdn.afuchat.com/cloud/object.jpg"),
    {},
    {},
  );

  assert.deepEqual(calls, [
    { handler: "media", path: "/chat/v1/storage/usage" },
    { handler: "chat", path: "/v1/chat/conversations" },
    { handler: "chat", path: "/v1/chat/me" },
  ]);
  assert.equal(oldApiPath.status, 404);
  assert.equal(oldStoragePath.status, 404);
  assert.equal(wrongCdnPrefix.status, 404);
  assert.equal(cdnPath.status, 404);
});

test("API host /chat namespace is not treated as a storage object key", async () => {
  const router = createAfuChatWorkerRouter(worker, mediaHandler);

  for (const path of ["/chat", "/chat/"]) {
    const response = await router.fetch(
      new Request(`https://api.afuchat.com${path}`),
      makeEnv(),
      {},
    );
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.error, "The requested API endpoint was not found.");
    assert.doesNotMatch(JSON.stringify(payload), /Invalid storage key|Invalid object key/);
  }
});

test("AfuChat status reports health without exposing provider or database details", async () => {
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
  assert.deepEqual(Object.keys(payload).sort(), ["ok", "timestamp"]);
});

test("current profile uses the verified AfuAuth identity and returns the mobile profile shape", async () => {
  const token = "profile-session-token";
  const env = makeEnv();
  const profile = {
    id: "user-123",
    handle: "test-user",
    display_name: "Test User",
    avatar_url: null,
    banner_url: null,
    bio: null,
    phone_number: null,
    xp: 20,
    acoin: 5,
    current_grade: "Bronze",
    is_verified: false,
    is_private: false,
    show_online_status: true,
    country: null,
    website_url: null,
    language: "en",
    tipping_enabled: true,
    is_admin: false,
    is_support_staff: false,
    is_organization_verified: false,
    is_business_mode: false,
    gender: null,
    date_of_birth: null,
    region: null,
    interests: [],
    onboarding_completed: true,
    scheduled_deletion_at: null,
    created_at: "2026-10-01T00:00:00.000Z",
    platinum_until: null,
  };
  let authRequest;
  let profileRequest;
  env.AFUAUTH_API.fetch = async (input) => {
    authRequest = input instanceof Request ? input : new Request(input);
    return Response.json({ user: { id: "user-123" }, accessToken: token });
  };
  globalThis.fetch = async (input) => {
    profileRequest = input instanceof Request ? input : new Request(input);
    return Response.json([profile]);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/me?id=attacker-selected-id", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const query = new URL(profileRequest.url).searchParams;

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), profile);
  assert.equal(authRequest.url, "https://afuauth-api/v1/auth/session");
  assert.equal(authRequest.method, "POST");
  assert.equal(authRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(profileRequest.method, "GET");
  assert.equal(query.get("id"), "eq.user-123");
  assert.notEqual(query.get("id"), "eq.attacker-selected-id");
  assert.equal(query.get("limit"), "2");
  assert.match(query.get("select"), /platinum_until/);
  assert.equal(profileRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(profileRequest.headers.get("apikey"), env.SUPABASE_ANON_KEY);
  assert.equal(profileRequest.headers.get("Accept-Profile"), "accounts");
  assert.match(response.headers.get("Cache-Control"), /private, no-store/);
});

test("current profile rejects missing or invalid sessions before reading Supabase", async () => {
  const env = makeEnv();
  let authCalls = 0;
  let databaseCalls = 0;
  env.AFUAUTH_API.fetch = async () => {
    authCalls += 1;
    return Response.json({ error: "Invalid token" }, { status: 401 });
  };
  globalThis.fetch = async () => {
    databaseCalls += 1;
    return Response.json([]);
  };

  const missing = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/me"),
    env,
  );
  const invalid = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/me", {
      headers: { Authorization: "Bearer invalid-session" },
    }),
    env,
  );

  assert.equal(missing.status, 401);
  assert.equal(invalid.status, 401);
  assert.equal(authCalls, 1);
  assert.equal(databaseCalls, 0);
  assert.doesNotMatch(await invalid.text(), /Supabase|Worker|service binding/i);
});

test("current profile only accepts GET and supports the AfuChat CORS preflight", async () => {
  const post = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/me", { method: "POST" }),
    makeEnv(),
  );
  const preflight = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/me", {
      method: "OPTIONS",
      headers: {
        Origin: "https://afuchat.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    }),
    makeEnv(),
  );

  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, OPTIONS");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "https://afuchat.com");
  assert.match(preflight.headers.get("Access-Control-Allow-Headers") ?? "", /Authorization/i);
});

test("current profile returns a safe not-found response when the shared profile row is absent", async () => {
  const token = "valid-session";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  globalThis.fetch = async () => Response.json([]);

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error, "User profile was not found.");
  assert.equal(typeof payload.request_id, "string");
  assert.doesNotMatch(JSON.stringify(payload), /database|schema|Worker|Supabase/i);
});

test("current profile sanitizes shared-database failures", async () => {
  const token = "valid-session";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  globalThis.fetch = async () =>
    Response.json(
      { code: "PGRST123", message: "internal database detail" },
      { status: 500 },
    );
  const previousConsoleError = console.error;
  console.error = () => {};

  try {
    const response = await worker.fetch(
      new Request("https://api.afuchat.com/v1/chat/me", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.equal(payload.error, "User profile could not be loaded.");
    assert.doesNotMatch(JSON.stringify(payload), /PGRST|database|internal|Supabase/i);
  } finally {
    console.error = previousConsoleError;
  }
});

test("bookmark batch lookup scopes results to the verified account", async () => {
  const token = "bookmark-session";
  const postA = "123e4567-e89b-42d3-a456-426614174001";
  const postB = "123e4567-e89b-42d3-a456-426614174002";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  let databaseRequest;
  globalThis.fetch = async (input, init) => {
    databaseRequest = input instanceof Request ? input : new Request(input, init);
    return Response.json([{ post_id: postA, created_at: "2026-10-07T10:00:00.000Z" }]);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/bookmarks?post_ids=${postA},${postB}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { post_ids: [postA] });
  assert.equal(new URL(databaseRequest.url).pathname, "/rest/v1/post_bookmarks");
  assert.equal(new URL(databaseRequest.url).searchParams.get("user_id"), "eq.user-123");
  assert.equal(
    new URL(databaseRequest.url).searchParams.get("post_id"),
    `in.(${postA},${postB})`,
  );
  assert.equal(databaseRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(databaseRequest.headers.get("Accept-Profile"), "public");
});

test("bookmark list hydrates the existing post and author without relying on saved_posts", async () => {
  const token = "bookmark-session";
  const postId = "123e4567-e89b-42d3-a456-426614174001";
  const authorId = "123e4567-e89b-42d3-a456-426614174002";
  const savedAt = "2026-10-07T10:00:00.000Z";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/rest/v1/post_bookmarks") {
      return Response.json([{ post_id: postId, created_at: savedAt }]);
    }
    if (path === "/rest/v1/posts") {
      return Response.json([{
        id: postId,
        author_id: authorId,
        content: "Saved post",
        image_url: "https://cdn.example.test/chat/post.jpg",
        created_at: "2026-10-06T09:00:00.000Z",
      }]);
    }
    if (path === "/rest/v1/profiles") {
      return Response.json([{
        id: authorId,
        handle: "author",
        display_name: "Author",
        avatar_url: null,
        is_verified: true,
      }]);
    }
    throw new Error(`Unexpected Supabase path ${path}`);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/bookmarks", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [{
      id: postId,
      post_id: postId,
      saved_at: savedAt,
      post: {
        id: postId,
        content: "Saved post",
        media_url: "https://cdn.example.test/chat/post.jpg",
        created_at: "2026-10-06T09:00:00.000Z",
        author: {
          handle: "author",
          display_name: "Author",
          avatar_url: null,
          is_verified: true,
        },
      },
    }],
  });
});

test("bookmark mutations always use the verified user and reject a mismatched queued owner", async () => {
  const token = "bookmark-session";
  const postId = "123e4567-e89b-42d3-a456-426614174001";
  const userId = "123e4567-e89b-42d3-a456-426614174002";
  const otherUserId = "123e4567-e89b-42d3-a456-426614174003";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    if (request.method === "GET") return Response.json([]);
    return new Response(null, { status: 201 });
  };

  const saved = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/bookmarks", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId }),
    }),
    env,
  );
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { bookmarked: true });
  assert.equal(requests[1].method, "POST");
  assert.deepEqual(await requests[1].json(), { post_id: postId, user_id: userId });

  const removed = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/bookmarks?post_id=${postId}&expected_user_id=${userId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { bookmarked: false });
  assert.equal(new URL(requests[2].url).searchParams.get("user_id"), `eq.${userId}`);

  const beforeMismatch = requests.length;
  const mismatch = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/bookmarks?post_id=${postId}&expected_user_id=${otherUserId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(mismatch.status, 409);
  assert.equal(requests.length, beforeMismatch);
});

test("bookmark routes reject invalid IDs and unauthenticated access", async () => {
  const env = makeEnv(401);
  let databaseCalls = 0;
  globalThis.fetch = async () => {
    databaseCalls += 1;
    return Response.json([]);
  };

  const invalidId = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/bookmarks?post_id=not-a-uuid", {
      headers: { Authorization: "Bearer invalid-session" },
    }),
    makeEnv(),
  );
  const unauthenticated = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/bookmarks"),
    env,
  );

  assert.equal(invalidId.status, 400);
  assert.equal(unauthenticated.status, 401);
  assert.equal(databaseCalls, 0);
});

test("support AI reply proxies the authenticated ticket request to its existing Supabase function", async () => {
  const token = "support-session-token";
  const ticketId = "123e4567-e89b-42d3-a456-426614174001";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  let functionRequest;
  globalThis.fetch = async (input, init) => {
    functionRequest = input instanceof Request ? input : new Request(input, init);
    return Response.json({ ok: true, skipped: true });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/support/ai-reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket_id: ticketId, ignored: "not forwarded" }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(functionRequest.url, "https://supabase.example.test/functions/v1/support-ai-reply");
  assert.equal(functionRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(functionRequest.headers.get("apikey"), env.SUPABASE_ANON_KEY);
  assert.deepEqual(await functionRequest.json(), { ticket_id: ticketId });
});

test("push registration validates direct FCM tokens and proxies the authenticated request", async () => {
  const token = "push-session-token";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  let functionRequest;
  globalThis.fetch = async (input, init) => {
    functionRequest = input instanceof Request ? input : new Request(input, init);
    return Response.json({ ok: true });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/push/register", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: "native-fcm-device-token-0123456789",
        platform: "android",
        provider: "fcm",
        appVersion: "1.0.0",
        ignored: "not forwarded",
      }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(functionRequest.url, "https://supabase.example.test/functions/v1/register-push-token");
  assert.equal(functionRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.deepEqual(await functionRequest.json(), {
    token: "native-fcm-device-token-0123456789",
    platform: "android",
    provider: "fcm",
    appVersion: "1.0.0",
  });
});

test("push registration rejects Expo tokens without calling the sender function", async () => {
  const token = "push-session-token";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  let functionCalls = 0;
  globalThis.fetch = async () => {
    functionCalls += 1;
    return Response.json({ ok: true });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/push/register", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: "ExponentPushToken[legacy-token-value]",
        platform: "android",
        provider: "fcm",
      }),
    }),
    env,
  );

  assert.equal(response.status, 400);
  assert.equal(functionCalls, 0);
});

test("push sending derives sender identity from AfuAuth before forwarding", async () => {
  const token = "push-session-token";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  let functionRequest;
  globalThis.fetch = async (input, init) => {
    functionRequest = input instanceof Request ? input : new Request(input, init);
    return Response.json({ ok: true });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/push/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientUserIds: ["recipient-456"],
        senderId: "user-123",
        senderName: "Test User",
        senderAvatarUrl: null,
        body: "A new message",
        chatId: "chat-123",
        messageId: "message-123",
        categoryId: "message",
        data: { chatId: "chat-123", messageId: "message-123" },
      }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(functionRequest.url, "https://supabase.example.test/functions/v1/send-push-notification");
  assert.equal(functionRequest.headers.get("Authorization"), `Bearer ${token}`);
  const forwarded = await functionRequest.json();
  assert.equal(forwarded.senderId, "user-123");
  assert.deepEqual(forwarded.recipientUserIds, ["recipient-456"]);
  assert.deepEqual(forwarded.data, { chatId: "chat-123", messageId: "message-123" });
});

test("push sending rejects spoofed sender IDs and sanitizes upstream errors", async () => {
  const token = "push-session-token";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  let functionCalls = 0;
  globalThis.fetch = async () => {
    functionCalls += 1;
    return Response.json({ ok: true });
  };

  const spoofed = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/push/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientUserIds: ["recipient-456"],
        senderId: "other-user",
        senderName: "Test User",
        body: "A new message",
        chatId: "chat-123",
        messageId: "message-123",
      }),
    }),
    env,
  );
  assert.equal(spoofed.status, 400);
  assert.equal(functionCalls, 0);

  const previousConsoleError = console.error;
  console.error = () => {};
  globalThis.fetch = async () =>
    Response.json({ message: "internal function stack trace" }, { status: 500 });
  try {
    const failed = await worker.fetch(
      new Request("https://api.afuchat.com/v1/chat/push/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientUserIds: ["recipient-456"],
          senderId: "user-123",
          senderName: "Test User",
          body: "A new message",
          chatId: "chat-123",
          messageId: "message-123",
        }),
      }),
      env,
    );
    const payload = await failed.json();
    assert.equal(failed.status, 502);
    assert.equal(payload.error, "Push notifications could not be sent.");
    assert.doesNotMatch(JSON.stringify(payload), /internal function|stack trace/i);
  } finally {
    console.error = previousConsoleError;
  }
});

test("account export verifies AfuAuth and sends only the selected export to the signed-in email", async () => {
  const token = "account-export-session";
  const env = makeEnv();
  env.RESEND_API_KEY = "test-resend-key";
  env.RESEND_FROM_EMAIL = "AfuChat <exports@example.test>";
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
  assert.equal(resendPayload.from, env.RESEND_FROM_EMAIL);
  assert.deepEqual(resendPayload.to, ["user@example.test"]);
  assert.deepEqual(resendPayload.attachments.map((attachment) => attachment.filename), [
    `afuchat-data-export-${new Date().toISOString().slice(0, 10)}.json`,
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

test("account export requires a configured sender even when the Resend key exists", async () => {
  const env = makeEnv();
  env.RESEND_API_KEY = "test-resend-key";
  env.AFUAUTH_API.fetch = async () =>
    Response.json({
      user: { id: "user-123", email: "user@example.test" },
      accessToken: "valid-session",
    });
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
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
  assert.equal(externalCalls, 0);
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

test("video route returns a generic unavailable response", async () => {
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/videos"),
    makeEnv(),
  );
  assert.equal(response.status, 501);
  assert.deepEqual((await response.json()).error, "Video processing is temporarily unavailable.");
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

test("conversation endpoint sanitizes upstream database errors", async () => {
  const env = makeEnv();
  const token = "same-supabase-session";
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  globalThis.fetch = async () =>
    Response.json({
      message: "relation private_schema.internal_table does not exist at db.internal.test",
      worker: "database-proxy-worker",
    }, { status: 500 });

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/conversations", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.deepEqual(Object.keys(payload).sort(), ["error", "request_id"]);
  assert.equal(payload.error, "Chat data could not be loaded.");
  assert.equal(JSON.stringify(payload).includes("private_schema"), false);
  assert.equal(JSON.stringify(payload).includes("database-proxy-worker"), false);
});

test("conversation endpoint returns a generic error when the upstream request throws", async () => {
  const env = makeEnv();
  const token = "same-supabase-session";
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  globalThis.fetch = async () => {
    throw new Error("internal db host db.internal.test stack trace");
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/conversations", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.error, "Chat data could not be loaded.");
  assert.equal(JSON.stringify(payload).includes("db.internal.test"), false);
  assert.equal(JSON.stringify(payload).includes("stack trace"), false);
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

test("message endpoint derives sender identity and makes offline retries idempotent", async () => {
  const token = "message-session-token";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const chatId = "123e4567-e89b-42d3-a456-426614174000";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    return Response.json({ user: { id: userId }, accessToken: token });
  };

  let stored = null;
  let inserts = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    assert.equal(request.headers.get("Accept-Profile"), "public");
    const url = new URL(request.url);
    assert.equal(url.pathname, "/rest/v1/messages");

    if (request.method === "GET") {
      return Response.json(stored ? [stored] : []);
    }

    inserts += 1;
    const body = await request.json();
    assert.equal(body.sender_id, userId);
    assert.equal(body.chat_id, chatId);
    stored = {
      ...body,
      sent_at: "2026-10-07T12:00:00.000Z",
      reply_to_message_id: body.reply_to_message_id ?? null,
      attachment_url: body.attachment_url ?? null,
      attachment_type: body.attachment_type ?? null,
      attachment_name: body.attachment_name ?? null,
      attachment_size: body.attachment_size ?? null,
      audio_url: body.audio_url ?? null,
      edited_at: null,
    };
    return Response.json([stored], { status: 201 });
  };

  const makeRequest = () => new Request("https://api.afuchat.com/v1/chat/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      client_message_id: "pending-legacy-offline-42",
      encrypted_content: "retry me",
      expected_user_id: userId,
    }),
  });

  const first = await worker.fetch(makeRequest(), env);
  assert.equal(first.status, 201);
  const firstPayload = await first.json();
  assert.equal(firstPayload.message.sender_id, userId);
  assert.match(firstPayload.message.id, /^[0-9a-f-]{36}$/i);

  const retry = await worker.fetch(makeRequest(), env);
  assert.equal(retry.status, 200);
  const retryPayload = await retry.json();
  assert.equal(retryPayload.message.id, firstPayload.message.id);
  assert.equal(inserts, 1);
});

test("message endpoint rejects spoofed ownership and stale account queue items", async () => {
  const token = "message-owner-token";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  let databaseCalls = 0;
  globalThis.fetch = async () => {
    databaseCalls += 1;
    return Response.json([]);
  };

  const makeRequest = (payload) => new Request("https://api.afuchat.com/v1/chat/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const base = {
    chat_id: excludedChatId,
    client_message_id: "stable-local-id",
    encrypted_content: "hello",
  };

  const spoofed = await worker.fetch(
    makeRequest({ ...base, sender_id: "123e4567-e89b-42d3-a456-426614174001" }),
    env,
  );
  assert.equal(spoofed.status, 400);

  const stale = await worker.fetch(
    makeRequest({ ...base, expected_user_id: "123e4567-e89b-42d3-a456-426614174001" }),
    env,
  );
  assert.equal(stale.status, 409);
  assert.equal(databaseCalls, 0);
});

test("message endpoint requires a shared session and sanitizes database errors", async () => {
  let databaseCalls = 0;
  globalThis.fetch = async () => {
    databaseCalls += 1;
    if (databaseCalls === 1) return Response.json([]);
    return Response.json(
      { code: "42501", message: "sensitive RLS policy details" },
      { status: 403 },
    );
  };

  const unauthenticated = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: excludedChatId,
        client_message_id: "stable-local-id",
        encrypted_content: "hello",
      }),
    }),
    makeEnv(401),
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(databaseCalls, 0);

  const token = "message-rls-token";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: excludedChatId,
        client_message_id: "stable-local-id",
        encrypted_content: "hello",
      }),
    }),
    env,
  );
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.error, "Message could not be sent.");
  assert.equal(JSON.stringify(payload).includes("sensitive RLS policy details"), false);
});
