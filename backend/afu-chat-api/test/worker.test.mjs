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

function makeContactProfile(id, overrides = {}) {
  return {
    id,
    handle: "other-user",
    display_name: "Other User",
    avatar_url: "https://cdn.afuchat.com/avatar.jpg",
    banner_url: "https://cdn.afuchat.com/banner.jpg",
    bio: "A public profile",
    is_verified: true,
    is_organization_verified: false,
    is_business_mode: false,
    is_private: false,
    country: "Uganda",
    website_url: "https://example.com",
    xp: 150,
    current_grade: "Active",
    acoin: 20,
    last_seen: "2026-10-08T07:00:00.000Z",
    show_online_status: false,
    created_at: "2025-02-01T00:00:00.000Z",
    phone_number: "+256700000000",
    is_admin: true,
    date_of_birth: "1990-01-01",
    ...overrides,
  };
}

function mockContactProfileReads(profile, { blocked = [], follows = [] } = {}) {
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    requests.push(request);
    if (url.pathname === "/rest/v1/profiles") return Response.json([profile]);
    if (url.pathname === "/rest/v1/blocked_users") return Response.json(blocked);
    if (url.pathname === "/rest/v1/follows") return Response.json(follows);
    return Response.json([]);
  };
  return requests;
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

test("other-user profile uses verified identity and returns only contact-page fields", async () => {
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const token = "contact-profile-session";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "123e4567-e89b-42d3-a456-426614174124" }, accessToken: token });
  const requests = mockContactProfileReads(makeContactProfile(profileId));

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/profiles/${profileId}?id=attacker-id`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();
  const profileRequest = requests.find((request) => new URL(request.url).pathname.endsWith("/profiles"));
  const blockRequest = requests.find((request) => new URL(request.url).pathname.endsWith("/blocked_users"));
  const query = new URL(profileRequest.url).searchParams;

  assert.equal(response.status, 200);
  assert.equal(payload.profile.id, profileId);
  assert.equal(payload.profile.handle, "other-user");
  assert.equal(payload.profile.country, "Uganda");
  assert.equal(payload.profile.website_url, "https://example.com");
  assert.equal(payload.profile.last_seen, null);
  assert.equal(payload.profile.show_online_status, false);
  assert.deepEqual(
    Object.keys(payload.profile).sort(),
    [
      "id", "display_name", "handle", "avatar_url", "banner_url", "bio",
      "is_verified", "is_organization_verified", "is_business_mode", "is_private",
      "country", "website_url", "xp", "current_grade", "acoin", "last_seen",
      "show_online_status", "created_at",
    ].sort(),
  );
  assert.equal(query.get("id"), `eq.${profileId}`);
  assert.equal(query.get("limit"), "2");
  assert.doesNotMatch(query.get("select"), /phone_number|is_admin|date_of_birth/);
  assert.equal(profileRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(profileRequest.headers.get("apikey"), env.SUPABASE_ANON_KEY);
  assert.equal(profileRequest.headers.get("Accept-Profile"), "accounts");
  assert.equal(blockRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.match(response.headers.get("Cache-Control"), /private, no-store/);
});

test("private contact profiles return a minimal preview unless the viewer follows them", async () => {
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const viewerId = "123e4567-e89b-42d3-a456-426614174124";
  const token = "private-contact-profile-session";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: viewerId }, accessToken: token });

  const privateProfile = makeContactProfile(profileId, {
    is_private: true,
    show_online_status: true,
  });
  mockContactProfileReads(privateProfile);
  const previewResponse = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/profiles/${profileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const preview = (await previewResponse.json()).profile;
  assert.equal(previewResponse.status, 200);
  assert.equal(preview.is_private, true);
  assert.equal(preview.display_name, "Other User");
  assert.equal(preview.avatar_url, "https://cdn.afuchat.com/avatar.jpg");
  assert.equal(preview.banner_url, null);
  assert.equal(preview.bio, null);
  assert.equal(preview.country, null);
  assert.equal(preview.website_url, null);
  assert.equal(preview.xp, 0);
  assert.equal(preview.acoin, 0);
  assert.equal(preview.last_seen, null);
  assert.equal(preview.created_at, null);

  const requests = mockContactProfileReads(privateProfile, { follows: [{ id: "follow-row" }] });
  const followedResponse = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/profiles/${profileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const followed = (await followedResponse.json()).profile;
  assert.equal(followedResponse.status, 200);
  assert.equal(followed.bio, "A public profile");
  assert.equal(followed.country, "Uganda");
  assert.equal(followed.last_seen, "2026-10-08T07:00:00.000Z");
  assert.equal(followed.show_online_status, true);
  const followRequest = requests.find((request) => new URL(request.url).pathname.endsWith("/follows"));
  const followQuery = new URL(followRequest.url).searchParams;
  assert.equal(followQuery.get("follower_id"), `eq.${viewerId}`);
  assert.equal(followQuery.get("following_id"), `eq.${profileId}`);
});

test("contact profile is hidden when either account has blocked the other", async () => {
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const viewerId = "123e4567-e89b-42d3-a456-426614174124";
  const token = "blocked-contact-profile-session";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: viewerId }, accessToken: token });
  mockContactProfileReads(makeContactProfile(profileId), {
    blocked: [{ blocker_id: profileId, blocked_id: viewerId }],
  });

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/profiles/${profileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();
  assert.equal(response.status, 404);
  assert.equal(payload.error, "Profile was not found.");
  assert.equal("profile" in payload, false);
});

test("contact profile distinguishes authorization and upstream failures", async () => {
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const unauthenticated = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/profiles/${profileId}`),
    makeEnv(),
  );
  assert.equal(unauthenticated.status, 401);

  const env = makeEnv();
  const token = "contact-profile-error-session";
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "123e4567-e89b-42d3-a456-426614174124" }, accessToken: token });
  globalThis.fetch = async () =>
    Response.json(
      { code: "PGRST999", message: "internal database details" },
      { status: 500 },
    );
  const previousConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await worker.fetch(
      new Request(`https://api.afuchat.com/v1/chat/profiles/${profileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.equal(payload.error, "Profile could not be loaded.");
    assert.doesNotMatch(JSON.stringify(payload), /PGRST|database|internal|Supabase/i);
  } finally {
    console.error = previousConsoleError;
  }
});

test("contact profile returns not-found only when the shared profile row is absent", async () => {
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const token = "missing-contact-profile-session";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "123e4567-e89b-42d3-a456-426614174124" }, accessToken: token });
  globalThis.fetch = async () => Response.json([]);

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/profiles/${profileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();
  assert.equal(response.status, 404);
  assert.equal(payload.error, "Profile was not found.");
  assert.equal(typeof payload.request_id, "string");
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

test("message history uses the verified session, a fixed projection, and bounded cursors", async () => {
  const token = "message-read-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const chatId = "123e4567-e89b-42d3-a456-426614174000";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const databaseRequests = [];
  const rows = [{
    id: "123e4567-e89b-42d3-a456-426614174010",
    chat_id: chatId,
    sender_id: "123e4567-e89b-42d3-a456-426614174098",
    encrypted_content: "ciphertext",
    sent_at: "2026-10-07T12:00:00.000Z",
    reply_to_message_id: null,
    attachment_url: null,
    attachment_type: null,
    attachment_name: null,
    attachment_size: null,
    audio_url: null,
    edited_at: null,
  }];
  globalThis.fetch = async (input, init) => {
    databaseRequests.push(new Request(input, init));
    return Response.json(rows);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/messages?chat_id=${chatId}&sender=others&after=2026-10-01T00%3A00%3A00.000Z&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { messages: rows });
  assert.equal(databaseRequests.length, 1);
  const databaseRequest = databaseRequests[0];
  const databaseUrl = new URL(databaseRequest.url);
  assert.equal(databaseRequest.headers.get("Accept-Profile"), "public");
  assert.equal(databaseRequest.headers.get("Content-Profile"), "public");
  assert.equal(databaseUrl.pathname, "/rest/v1/messages");
  assert.equal(databaseUrl.searchParams.get("chat_id"), `eq.${chatId}`);
  assert.equal(databaseUrl.searchParams.has("sender_id"), false);
  assert.equal(databaseUrl.searchParams.get("sent_at"), "gt.2026-10-01T00:00:00.000Z");
  assert.equal(databaseUrl.searchParams.get("limit"), "50");
  assert.equal(databaseUrl.searchParams.get("order"), "sent_at.desc,id.desc");
  assert.equal(databaseUrl.searchParams.has("select"), true);
  assert.equal(databaseRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.match(response.headers.get("Cache-Control"), /private, no-store/);
});

test("message history rejects arbitrary projections, malformed IDs, and missing sessions", async () => {
  const env = makeEnv();
  let databaseCalls = 0;
  globalThis.fetch = async () => {
    databaseCalls += 1;
    return Response.json([]);
  };
  const token = "message-read-invalid-session";
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "123e4567-e89b-42d3-a456-426614174099" }, accessToken: token });

  const invalidQuery = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages?chat_id=bad&select=*", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const unauthenticated = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/messages?chat_id=${excludedChatId}`),
    makeEnv(401),
  );

  assert.equal(invalidQuery.status, 400);
  assert.equal(unauthenticated.status, 401);
  assert.equal(databaseCalls, 0);
});

test("chat member reads use only the AfuChat-backed public relation", async () => {
  const token = "chat-members-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const chatId = "123e4567-e89b-42d3-a456-426614174000";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  const canonicalMember = {
    id: "123e4567-e89b-42d3-a456-426614174020",
    chat_id: chatId,
    user_id: userId,
    is_admin: true,
    joined_at: "2026-10-07T12:00:00.000Z",
  };
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return Response.json([canonicalMember]);
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/members?chat_id=${chatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    members: [canonicalMember],
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(requests[0].headers.get("Accept-Profile"), "public");
  assert.equal(requests[0].headers.get("Content-Profile"), "public");
  assert.equal(new URL(requests[0].url).searchParams.get("chat_id"), `eq.${chatId}`);
});

test("message count reads only the AfuChat-backed public relation", async () => {
  const token = "message-count-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const chatId = "123e4567-e89b-42d3-a456-426614174000";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const databaseRequests = [];
  globalThis.fetch = async (input, init) => {
    const databaseRequest = new Request(input, init);
    databaseRequests.push(databaseRequest);
    return Response.json([
      {
        id: "123e4567-e89b-42d3-a456-426614174010",
        chat_id: chatId,
        sender_id: "123e4567-e89b-42d3-a456-426614174098",
        encrypted_content: "ciphertext-from-other-user",
        sent_at: "2026-10-07T12:00:00.000Z",
      },
      {
        id: "123e4567-e89b-42d3-a456-426614174011",
        chat_id: chatId,
        sender_id: userId,
        encrypted_content: "ciphertext-from-current-user",
        sent_at: "2026-10-07T11:00:00.000Z",
      },
    ]);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/messages/count?chat_id=${chatId}&sender=others`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { count: 1 });
  assert.equal(databaseRequests.length, 1);
  assert.equal(databaseRequests[0].headers.get("Accept-Profile"), "public");
  assert.equal(databaseRequests[0].headers.get("Authorization"), `Bearer ${token}`);
  const databaseUrl = new URL(databaseRequests[0].url);
  assert.equal(databaseUrl.pathname, "/rest/v1/messages");
  assert.equal(databaseUrl.searchParams.get("chat_id"), `eq.${chatId}`);
  assert.equal(databaseUrl.searchParams.has("sender_id"), false);
});

test("message status reads and updates use the authenticated user, not caller identity", async () => {
  const token = "message-status-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const chatId = "123e4567-e89b-42d3-a456-426614174000";
  const messageId = "123e4567-e89b-42d3-a456-426614174010";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const databaseRequests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    databaseRequests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/messages")) {
      return Response.json([{ id: messageId }]);
    }
    if (request.method === "GET") {
      return Response.json([{
        message_id: messageId,
        user_id: userId,
        delivered_at: "2026-10-07T12:00:00.000Z",
        read_at: "2026-10-07T12:00:01.000Z",
      }]);
    }
    const rows = await request.json();
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("Prefer"), "resolution=merge-duplicates,return=minimal");
    assert.deepEqual(rows.map((row) => row.user_id), [userId]);
    assert.deepEqual(rows.map((row) => row.message_id), [messageId]);
    assert.equal(typeof rows[0].delivered_at, "string");
    assert.equal(typeof rows[0].read_at, "string");
    return new Response(null, { status: 204 });
  };

  const read = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/messages/status?message_ids=${messageId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  const update = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        read_receipts: true,
        expected_user_id: userId,
      }),
    }),
    env,
  );

  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).statuses[0].message_id, messageId);
  assert.equal(update.status, 200);
  assert.deepEqual(await update.json(), { ok: true, updated: 1 });
  assert.equal(databaseRequests.length, 3);
  const targetQuery = new URL(databaseRequests[1].url);
  assert.equal(targetQuery.searchParams.get("chat_id"), `eq.${chatId}`);
  assert.equal(targetQuery.searchParams.get("sender_id"), `neq.${userId}`);
  assert.equal(databaseRequests[1].headers.get("Authorization"), `Bearer ${token}`);
});

test("message status rejects spoofed owners and invalid batches before database access", async () => {
  const token = "message-status-owner-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const messageId = "123e4567-e89b-42d3-a456-426614174010";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  let databaseCalls = 0;
  globalThis.fetch = async () => {
    databaseCalls += 1;
    return new Response(null, { status: 204 });
  };

  const spoofed = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message_ids: [messageId], expected_user_id: excludedChatId }),
    }),
    env,
  );
  const invalidBatch = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message_ids: ["not-a-uuid"] }),
    }),
    env,
  );

  assert.equal(spoofed.status, 409);
  assert.equal(invalidBatch.status, 400);
  assert.equal(databaseCalls, 0);
});

test("message reactions use a fixed read shape and derive mutation ownership", async () => {
  const token = "message-reactions-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const messageId = "123e4567-e89b-42d3-a456-426614174010";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const databaseRequests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    databaseRequests.push(request);
    if (request.method === "GET") {
      return Response.json([{ message_id: messageId, reaction: "💙", user_id: userId }]);
    }
    if (request.method === "POST") {
      const body = await request.json();
      assert.deepEqual(body, { message_id: messageId, user_id: userId, reaction: "💙" });
      return new Response(null, { status: 201 });
    }
    return new Response(null, { status: 204 });
  };

  const read = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/messages/reactions?message_ids=${messageId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  const add = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/reactions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message_id: messageId, reaction: "💙" }),
    }),
    env,
  );
  const remove = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/messages/reactions?message_id=${messageId}&reaction=%F0%9F%92%99&expected_user_id=${userId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  const readUrl = new URL(databaseRequests[0].url);
  const deleteUrl = new URL(databaseRequests[2].url);
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).reactions[0], {
    message_id: messageId,
    reaction: "💙",
    user_id: userId,
  });
  assert.equal(readUrl.searchParams.get("select"), "message_id,reaction,user_id");
  assert.equal(add.status, 200);
  assert.equal(remove.status, 200);
  assert.equal(deleteUrl.searchParams.get("message_id"), `eq.${messageId}`);
  assert.equal(deleteUrl.searchParams.get("user_id"), `eq.${userId}`);
  assert.equal(databaseRequests[1].headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(databaseRequests.length, 3);
});

test("message edit history uses a fixed projection and the caller's Supabase session", async () => {
  const token = "message-edit-history-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const messageId = "123e4567-e89b-42d3-a456-426614174010";
  const editedAt = "2026-10-07T10:00:00.000Z";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  let databaseRequest;
  globalThis.fetch = async (input, init) => {
    databaseRequest = new Request(input, init);
    return Response.json([{ id: "edit-1", previous_content: "old text", edited_at: editedAt }]);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/messages/edit-history?message_id=${messageId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  const query = new URL(databaseRequest.url).searchParams;
  const history = await response.json();
  assert.equal(response.status, 200);
  assert.equal(query.get("select"), "id,previous_content,edited_at");
  assert.equal(query.get("message_id"), `eq.${messageId}`);
  assert.equal(query.get("order"), "edited_at.desc");
  assert.equal(query.get("limit"), "100");
  assert.equal(databaseRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.deepEqual(history.history, [
    { id: "edit-1", previous_content: "old text", edited_at: editedAt },
  ]);
});

test("message edit derives ownership and records the previous text", async () => {
  const token = "message-edit-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const messageId = "123e4567-e89b-42d3-a456-426614174010";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const original = {
    id: messageId,
    sender_id: userId,
    encrypted_content: "before",
    sent_at: new Date().toISOString(),
  };
  let updated;
  let patch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "GET") return Response.json([original]);
    if (request.method === "PATCH") {
      patch = await request.json();
      updated = {
        ...original,
        chat_id: "123e4567-e89b-42d3-a456-426614174000",
        ...patch,
        reply_to_message_id: null,
        attachment_url: null,
        attachment_type: null,
        attachment_name: null,
        attachment_size: null,
        audio_url: null,
      };
      return Response.json([updated]);
    }
    if (request.method === "POST") return new Response(null, { status: 201 });
    throw new Error(`Unexpected request ${request.method}`);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/edit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message_id: messageId,
        encrypted_content: "after",
        expected_user_id: userId,
      }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: updated, history_saved: true });
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[0].url).searchParams.get("sender_id"), `eq.${userId}`);
  assert.equal(new URL(requests[1].url).searchParams.get("sender_id"), `eq.${userId}`);
  assert.equal(requests[1].method, "PATCH");
  assert.equal(requests[2].method, "POST");
  const historyInsert = await requests[2].json();
  assert.deepEqual(historyInsert, {
    message_id: messageId,
    edited_by: userId,
    previous_content: "before",
    edited_at: patch.edited_at,
  });
  assert.equal(requests.every((request) =>
    request.headers.get("Authorization") === `Bearer ${token}`
  ), true);
});

test("expired message edits are rejected before update or history writes", async () => {
  const token = "message-edit-expired-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const messageId = "123e4567-e89b-42d3-a456-426614174010";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  let databaseCalls = 0;
  globalThis.fetch = async () => {
    databaseCalls += 1;
    return Response.json([{
      id: messageId,
      sender_id: userId,
      encrypted_content: "before",
      sent_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    }]);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/edit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message_id: messageId, encrypted_content: "after" }),
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.match(payload.error, /within 15 minutes/);
  assert.equal(databaseCalls, 1);
});

test("message delete and report mutations derive their owner from AfuAuth", async () => {
  const token = "message-actions-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const messageId = "123e4567-e89b-42d3-a456-426614174010";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "DELETE") return Response.json([{ id: messageId }]);
    return new Response(null, { status: 201 });
  };

  const deleted = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, expected_user_id: userId }),
    }),
    env,
  );
  const reported = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/report", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message_id: messageId,
        reason: "Spam",
        message_content: "reported text",
        reporter_id: "attacker-value",
      }),
    }),
    env,
  );

  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true });
  assert.equal(new URL(requests[0].url).searchParams.get("sender_id"), `eq.${userId}`);
  assert.equal(requests[0].method, "DELETE");
  assert.equal(reported.status, 400);
  assert.equal(requests.length, 1);

  const validReport = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/report", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message_id: messageId,
        reason: "Spam",
        message_content: "reported text",
        expected_user_id: userId,
      }),
    }),
    env,
  );
  assert.equal(validReport.status, 200);
  assert.deepEqual(await requests[1].json(), {
    reporter_id: userId,
    message_id: messageId,
    reason: "Spam",
    message_content: "reported text",
  });
});

test("saving a starred message derives the saved owner and message fields server-side", async () => {
  const token = "starred-message-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const senderId = "123e4567-e89b-42d3-a456-426614174011";
  const chatId = "123e4567-e89b-42d3-a456-426614174000";
  const messageId = "123e4567-e89b-42d3-a456-426614174010";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/messages")) {
      return Response.json([{
        id: messageId,
        chat_id: chatId,
        sender_id: senderId,
        encrypted_content: "GIF",
        attachment_url: "https://media.example.test/gif",
        attachment_type: "gif",
      }]);
    }
    if (path.endsWith("/profiles")) {
      assert.equal(request.headers.get("Accept-Profile"), "accounts");
      return Response.json([{ id: senderId, display_name: "Sender", avatar_url: null }]);
    }
    if (path.endsWith("/starred_messages")) return new Response(null, { status: 201 });
    throw new Error(`Unexpected request ${path}`);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/starred", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: true });
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[0].url).searchParams.get("select"), "id,chat_id,sender_id,encrypted_content,attachment_url,attachment_type");
  assert.equal(requests[0].headers.get("Authorization"), `Bearer ${token}`);
  assert.deepEqual(await requests[2].json(), {
    user_id: userId,
    message_id: messageId,
    chat_id: chatId,
    content: "GIF",
    sender_id: senderId,
    sender_name: "Sender",
    sender_avatar: null,
    attachment_url: "https://media.example.test/gif",
    attachment_type: "gif",
  });
});

test("clear chat history is scoped to the verified member and only their messages", async () => {
  const token = "clear-chat-history-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const chatIds = [
    "123e4567-e89b-42d3-a456-426614174000",
    "123e4567-e89b-42d3-a456-426614174001",
  ];
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "GET") {
      return Response.json(chatIds.map((chat_id) => ({ chat_id })));
    }
    return new Response(null, { status: 204 });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/messages/clear", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archive: true, expected_user_id: userId }),
    }),
    env,
  );
  const membershipQuery = new URL(requests[0].url).searchParams;
  const updateQuery = new URL(requests[1].url).searchParams;

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, archive: true, chats: 2 });
  assert.equal(membershipQuery.get("user_id"), `eq.${userId}`);
  assert.equal(membershipQuery.get("limit"), "1000");
  assert.equal(requests[0].headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(requests[1].method, "PATCH");
  assert.equal(updateQuery.get("chat_id"), `in.(${chatIds.join(",")})`);
  assert.equal(updateQuery.get("sender_id"), `eq.${userId}`);
  assert.deepEqual(await requests[1].json(), { is_archived: true });
  assert.equal(requests[1].headers.get("Authorization"), `Bearer ${token}`);
});

test("post creation derives the author from AfuAuth and saves uploaded image rows", async () => {
  const token = "create-post-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (new URL(request.url).pathname.endsWith("/posts")) {
      return Response.json([{
        id: postId,
        author_id: userId,
        content: "A post",
        image_url: "https://cdn.afuchat.com/chat/containers/user/photo.jpg",
      }], { status: 201 });
    }
    if (new URL(request.url).pathname.endsWith("/post_images")) {
      return Response.json([], { status: 201 });
    }
    return Response.json({ error: "unexpected request" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        author_id: "123e4567-e89b-42d3-a456-426614174000",
        content: "A post",
        image_url: "https://cdn.afuchat.com/chat/containers/user/photo.jpg",
        images: [
          "https://cdn.afuchat.com/chat/containers/user/photo.jpg",
          "https://cdn.afuchat.com/chat/containers/user/photo-2.jpg",
        ],
      }),
    }),
    env,
  );

  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).post, {
    id: postId,
    author_id: userId,
    content: "A post",
    image_url: "https://cdn.afuchat.com/chat/containers/user/photo.jpg",
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(requests[0].headers.get("Content-Profile"), "public");
  const insertBody = await requests[0].json();
  assert.equal(insertBody.author_id, userId);
  assert.notEqual(insertBody.author_id, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(insertBody.view_count, 0);
  assert.deepEqual(await requests[1].json(), [
    { post_id: postId, image_url: "https://cdn.afuchat.com/chat/containers/user/photo.jpg", display_order: 0 },
    { post_id: postId, image_url: "https://cdn.afuchat.com/chat/containers/user/photo-2.jpg", display_order: 1 },
  ]);
});

test("post detail preserves post, image, and shared account profile response shape", async () => {
  const token = "get-post-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const authorId = "123e4567-e89b-42d3-a456-426614174098";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/posts")) {
      return Response.json([{
        id: postId,
        author_id: authorId,
        content: "Post body",
        like_count: 3,
        post_type: "text",
      }]);
    }
    if (url.pathname.endsWith("/post_images")) {
      return Response.json([{ post_id: postId, image_url: "https://example.test/a.jpg", display_order: 0 }]);
    }
    if (url.pathname.endsWith("/profiles")) {
      return Response.json([{
        id: authorId,
        display_name: "Post author",
        handle: "author",
        avatar_url: null,
        is_verified: false,
        is_organization_verified: false,
      }]);
    }
    if (url.pathname.endsWith("/post_acknowledgments")) return Response.json([]);
    return Response.json({ error: "unexpected request" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/posts/${postId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.post.id, postId);
  assert.equal(payload.post.profiles.id, authorId);
  assert.equal(payload.post.post_images[0].image_url, "https://example.test/a.jpg");
  assert.equal(requests[2].headers.get("Accept-Profile"), "accounts");
  assert.equal(requests[2].headers.get("Authorization"), `Bearer ${token}`);
});

test("my posts list is scoped to the authenticated author and returns aggregated details", async () => {
  const token = "my-posts-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/posts")) {
      return new Response(JSON.stringify([{
          id: postId,
          content: "Mine",
          image_url: null,
          post_type: "post",
          visibility: "public",
        }]), {
        headers: { "Content-Range": "0-0/1" },
      });
    }
    if (path.endsWith("/post_images")) {
      return Response.json([{ post_id: postId, image_url: "https://example.test/a.jpg", display_order: 0 }]);
    }
    if (path.endsWith("/post_acknowledgments")) {
      return Response.json([{ post_id: postId }, { post_id: postId }]);
    }
    if (path.endsWith("/post_replies")) {
      return Response.json([{ post_id: postId }]);
    }
    return Response.json({ error: "unexpected request" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/posts/mine", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items[0].likeCount, 2);
  assert.equal(payload.items[0].replyCount, 1);
  assert.deepEqual(payload.items[0].images, ["https://example.test/a.jpg"]);
  assert.equal(payload.total_count, 1);
  const query = new URL(requests[0].url).searchParams;
  assert.equal(query.get("author_id"), `eq.${userId}`);
  assert.equal(query.get("limit"), "50");
  assert.equal(requests[0].headers.get("Prefer"), "count=exact");
  assert.equal(requests[0].headers.get("Authorization"), `Bearer ${token}`);
});

test("profile posts respect the authenticated visibility policy and include an exact count", async () => {
  const token = "profile-posts-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const postId = "123e4567-e89b-42d3-a456-426614174124";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  let queryRequest;
  globalThis.fetch = async (input, init) => {
    queryRequest = new Request(input, init);
    return new Response(JSON.stringify([{
      id: postId,
      author_id: profileId,
      content: "Visible post",
      visibility: "public",
    }]), {
      headers: { "Content-Range": "0-0/4" },
    });
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/posts/profile/${profileId}?limit=90`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.items.map((item) => item.id), [postId]);
  assert.equal(payload.total_count, 4);
  const query = new URL(queryRequest.url).searchParams;
  assert.equal(query.get("author_id"), `eq.${profileId}`);
  assert.equal(query.get("or"), "(visibility.eq.public,visibility.eq.followers,visibility.is.null)");
  assert.equal(queryRequest.headers.get("Prefer"), "count=exact");
  assert.equal(queryRequest.headers.get("Authorization"), `Bearer ${token}`);
});

test("post deletion requires the verified author and returns representation", async () => {
  const token = "delete-post-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  let deleteRequest;
  globalThis.fetch = async (input, init) => {
    deleteRequest = new Request(input, init);
    return Response.json([{ id: postId }]);
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/posts/${postId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: postId });
  const query = new URL(deleteRequest.url).searchParams;
  assert.equal(query.get("author_id"), `eq.${userId}`);
  assert.equal(query.get("id"), `eq.${postId}`);
  assert.equal(deleteRequest.headers.get("Prefer"), "return=representation");
});

test("post routes reject bad IDs, oversized writes, and missing sessions before PostgREST", async () => {
  let postgrestCalls = 0;
  globalThis.fetch = async () => {
    postgrestCalls += 1;
    return Response.json([]);
  };

  const invalidId = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/posts/not-a-uuid"),
    makeEnv(),
  );
  assert.equal(invalidId.status, 400);

  const oversized = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/posts", {
      method: "POST",
      headers: { Authorization: "Bearer valid-session", "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x".repeat(40_001) }),
    }),
    makeEnv(),
  );
  assert.equal(oversized.status, 400);

  const unauthenticated = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/posts/mine"),
    makeEnv(),
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(postgrestCalls, 0);
});

test("post replies return shared profiles, like counts, and the signed-in user's like state", async () => {
  const token = "post-replies-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const authorId = "123e4567-e89b-42d3-a456-426614174098";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const replyId = "123e4567-e89b-42d3-a456-426614174124";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/post_replies")) {
      return Response.json([{
        id: replyId,
        author_id: authorId,
        content: "Reply",
        created_at: "2026-10-07T12:00:00Z",
        parent_reply_id: null,
        voice_url: null,
        voice_duration: null,
        image_url: null,
      }]);
    }
    if (path.endsWith("/profiles")) {
      return Response.json([{
        id: authorId,
        display_name: "Reply author",
        handle: "reply-author",
        avatar_url: "https://example.test/avatar.jpg",
      }]);
    }
    if (path.endsWith("/post_reply_likes")) {
      const userFilter = new URL(request.url).searchParams.get("user_id");
      return Response.json(userFilter ? [{ reply_id: replyId }] : [
        { reply_id: replyId },
        { reply_id: replyId },
      ]);
    }
    return Response.json({ error: "unexpected request" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/posts/${postId}/replies`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items[0].like_count, 2);
  assert.equal(payload.items[0].liked, true);
  assert.deepEqual(payload.items[0].profile, {
    display_name: "Reply author",
    handle: "reply-author",
    avatar_url: "https://example.test/avatar.jpg",
  });
  assert.equal(requests[1].headers.get("Accept-Profile"), "accounts");
  assert.equal(new URL(requests[2].url).searchParams.get("reply_id"), `in.(${replyId})`);
  assert.equal(new URL(requests[3].url).searchParams.get("user_id"), `eq.${userId}`);
});

test("reply creation verifies parent thread and derives author identity", async () => {
  const token = "create-post-reply-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const parentReplyId = "123e4567-e89b-42d3-a456-426614174124";
  const replyId = "123e4567-e89b-42d3-a456-426614174125";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "GET") return Response.json([{ id: parentReplyId }]);
    return Response.json([{
      id: replyId,
      author_id: userId,
      content: "Threaded reply",
      parent_reply_id: parentReplyId,
    }], { status: 201 });
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/posts/${postId}/replies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        author_id: "123e4567-e89b-42d3-a456-426614174000",
        content: "Threaded reply",
        parent_reply_id: parentReplyId,
      }),
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.reply.id, replyId);
  assert.equal(new URL(requests[0].url).searchParams.get("post_id"), `eq.${postId}`);
  const inserted = await requests[1].json();
  assert.equal(inserted.post_id, postId);
  assert.equal(inserted.author_id, userId);
  assert.notEqual(inserted.author_id, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(inserted.parent_reply_id, parentReplyId);
});

test("post likes are idempotent and always use the verified account", async () => {
  const token = "post-like-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  let insertRequest;
  globalThis.fetch = async (input, init) => {
    insertRequest = new Request(input, init);
    return Response.json([{ post_id: postId, user_id: userId }]);
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/posts/${postId}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { liked: true });
  const query = new URL(insertRequest.url).searchParams;
  assert.equal(query.get("on_conflict"), "post_id,user_id");
  assert.equal(insertRequest.headers.get("Prefer"), "resolution=merge-duplicates,return=representation");
  assert.deepEqual(await insertRequest.json(), { post_id: postId, user_id: userId });
});

test("reply likes verify that the target reply belongs to the requested post", async () => {
  const token = "reply-like-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const replyId = "123e4567-e89b-42d3-a456-426614174124";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "GET") return Response.json([{ id: replyId }]);
    return Response.json([]);
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/posts/${postId}/replies/${replyId}/like`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { liked: false });
  const ownershipQuery = new URL(requests[0].url).searchParams;
  assert.equal(ownershipQuery.get("id"), `eq.${replyId}`);
  assert.equal(ownershipQuery.get("post_id"), `eq.${postId}`);
  const deletionQuery = new URL(requests[1].url).searchParams;
  assert.equal(deletionQuery.get("reply_id"), `eq.${replyId}`);
  assert.equal(deletionQuery.get("user_id"), `eq.${userId}`);
});

test("follow summary counts relationships and derives viewer state from AfuAuth", async () => {
  const token = "follow-summary-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    const isCount = request.headers.has("Range");
    if (isCount && url.searchParams.get("following_id") === `eq.${profileId}`) {
      return Response.json([], { headers: { "Content-Range": "*/17" } });
    }
    if (isCount && url.searchParams.get("follower_id") === `eq.${profileId}`) {
      return Response.json([], { headers: { "Content-Range": "*/9" } });
    }
    if (
      url.searchParams.get("follower_id") === `eq.${profileId}` &&
      url.searchParams.get("following_id") === `eq.${userId}`
    ) {
      return Response.json([{ id: "follow-back" }]);
    }
    if (
      url.searchParams.get("follower_id") === `eq.${userId}` &&
      url.searchParams.get("following_id") === `eq.${profileId}`
    ) {
      return Response.json([]);
    }
    return Response.json({ error: "unexpected query" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/follows/summary?profile_id=${profileId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    followers_count: 17,
    following_count: 9,
    follows_you: true,
    is_following: false,
  });
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.headers.get("Authorization") === `Bearer ${token}`));
  assert.ok(requests.slice(0, 2).every((request) =>
    request.headers.get("Prefer")?.includes("count=exact")
  ));
});

test("follow mutations derive the follower and reject stale account queue actions", async () => {
  const token = "follow-mutation-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const targetId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return Response.json([{ follower_id: userId, following_id: targetId }]);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/follows", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        follower_id: "123e4567-e89b-42d3-a456-426614174000",
        target_user_id: targetId,
        expected_user_id: userId,
      }),
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    is_following: true,
    target_user_id: targetId,
  });
  const insert = requests[0];
  assert.deepEqual(await insert.json(), {
    follower_id: userId,
    following_id: targetId,
  });
  assert.equal(new URL(insert.url).searchParams.get("on_conflict"), "follower_id,following_id");
  assert.equal(
    insert.headers.get("Prefer"),
    "resolution=merge-duplicates,return=representation",
  );

  const stale = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/follows", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_user_id: targetId, expected_user_id: "another-account" }),
    }),
    env,
  );
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "ACCOUNT_MISMATCH");
  assert.equal(requests.length, 1);
});

test("follow lists honor account-profile privacy before reading relationships", async () => {
  const token = "hidden-follow-list-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    assert.equal(request.headers.get("Accept-Profile"), "accounts");
    return Response.json([{
      id: profileId,
      hide_followers_list: true,
      hide_following_list: false,
    }]);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/follows/list?profile_id=${profileId}&direction=followers`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], hidden: true, next_offset: null });
  assert.equal(requests.length, 1);
});

test("follow lists hydrate relationship rows from the shared accounts profile source", async () => {
  const token = "follow-list-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const followerId = "123e4567-e89b-42d3-a456-426614174124";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/profiles") && request.headers.get("Accept-Profile") === "accounts") {
      if (url.searchParams.get("select")?.includes("hide_followers_list")) {
        return Response.json([{
          id: profileId,
          hide_followers_list: false,
          hide_following_list: false,
        }]);
      }
      assert.equal(url.searchParams.get("id"), `in.(${followerId})`);
      return Response.json([{
        id: followerId,
        handle: "follower",
        display_name: "Follower",
        avatar_url: null,
        bio: null,
        is_verified: false,
        is_organization_verified: false,
        is_business_mode: false,
      }]);
    }
    if (url.pathname.endsWith("/follows")) {
      assert.equal(url.searchParams.get("following_id"), `eq.${profileId}`);
      return Response.json([{
        follower_id: followerId,
        following_id: profileId,
        created_at: "2026-10-07T12:00:00Z",
      }]);
    }
    return Response.json({ error: "unexpected query" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/follows/list?profile_id=${profileId}&direction=followers&limit=20&offset=0`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.hidden, false);
  assert.equal(payload.next_offset, null);
  assert.deepEqual(payload.items, [{
    follower_id: followerId,
    following_id: profileId,
    created_at: "2026-10-07T12:00:00Z",
    profile: {
      id: followerId,
      handle: "follower",
      display_name: "Follower",
      avatar_url: null,
      bio: null,
      is_verified: false,
      is_organization_verified: false,
      is_business_mode: false,
    },
  }]);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.headers.get("Authorization") === `Bearer ${token}`));
});

test("follow lists fail explicitly when a relationship profile cannot be hydrated", async () => {
  const token = "follow-list-incomplete-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const profileId = "123e4567-e89b-42d3-a456-426614174123";
  const followerId = "123e4567-e89b-42d3-a456-426614174124";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      url.pathname.endsWith("/profiles") &&
      request.headers.get("Accept-Profile") === "accounts"
    ) {
      if (url.searchParams.get("select")?.includes("hide_followers_list")) {
        return Response.json([{
          id: profileId,
          hide_followers_list: false,
          hide_following_list: false,
        }]);
      }
      return Response.json([]);
    }
    if (url.pathname.endsWith("/follows")) {
      return Response.json([{
        follower_id: followerId,
        following_id: profileId,
        created_at: "2026-10-07T12:00:00Z",
      }]);
    }
    return Response.json({ error: "unexpected query" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/follows/list?profile_id=${profileId}&direction=followers&limit=20&offset=0`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.equal(payload.code, "FOLLOW_PROFILE_HYDRATION_INCOMPLETE");
  assert.equal(typeof payload.request_id, "string");
  assert.equal(payload.items, undefined);
  assert.equal(JSON.stringify(payload).includes(followerId), false);
});

test("follow status batches return both relationship directions for authenticated viewer", async () => {
  const token = "follow-status-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const followingId = "123e4567-e89b-42d3-a456-426614174123";
  const followsYouId = "123e4567-e89b-42d3-a456-426614174124";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.searchParams.get("follower_id") === `eq.${userId}`) {
      return Response.json([{ following_id: followingId }]);
    }
    if (url.searchParams.get("following_id") === `eq.${userId}`) {
      return Response.json([{ follower_id: followsYouId }]);
    }
    return Response.json({ error: "unexpected query" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/follows/status?user_ids=${followingId},${followsYouId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [
      { user_id: followingId, is_following: true, follows_you: false },
      { user_id: followsYouId, is_following: false, follows_you: true },
    ],
  });
});

test("for-you feed keeps its server-backed streams and hydrates the original ranking inputs", async () => {
  const token = "discover-for-you-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const authorId = "123e4567-e89b-42d3-a456-426614174098";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/posts")) {
      const fields = url.searchParams.get("select");
      if (fields === "id,author_id") return Response.json([]);
      if (url.searchParams.get("limit") === "12") {
        return Response.json([{
          id: postId,
          author_id: authorId,
          content: "Candidate",
          image_url: null,
          created_at: "2026-10-07T12:00:00.000Z",
          view_count: 42,
          like_count: 7,
          visibility: "public",
          post_type: "post",
          video_asset_id: null,
        }]);
      }
      return Response.json([]);
    }
    if (url.pathname.endsWith("/profiles")) {
      assert.equal(request.headers.get("Accept-Profile"), "accounts");
      return Response.json([{
        id: authorId,
        display_name: "Author",
        handle: "author",
        avatar_url: "https://cdn.example.test/avatar.jpg",
        bio: "A bio",
        is_verified: true,
        is_organization_verified: false,
        country: "UG",
        interests: ["music"],
        hide_posts_non_followers: false,
      }]);
    }
    if (url.pathname.endsWith("/post_images")) return Response.json([]);
    if (url.pathname.endsWith("/post_acknowledgments")) return Response.json([]);
    if (url.pathname.endsWith("/post_replies")) return Response.json([{ post_id: postId }]);
    if (url.pathname.endsWith("/follows")) return Response.json([{ following_id: authorId }]);
    return Response.json({ error: "unexpected query" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request(
      "https://api.afuchat.com/v1/chat/feed/for-you?mid_offset=13&throwback_offset=24&recent_since=2026-10-03T12%3A00%3A00.000Z&mid_before=2026-10-03T12%3A00%3A00.000Z&mid_since=2026-09-07T12%3A00%3A00.000Z&throwback_before=2026-09-07T12%3A00%3A00.000Z",
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recent[0].id, postId);
  assert.equal(payload.recent[0].profiles.handle, "author");
  assert.equal(payload.recent[0].post_images.length, 0);
  assert.equal(payload.recent[0].replyCount, 1);
  assert.equal(payload.recent[0].isFollowing, true);
  assert.equal(payload.recent[0].authorInteractionCount, 0);
  assert.deepEqual(payload.mid, []);
  assert.deepEqual(payload.throwback, []);
  const midQuery = requests.find((request) => {
    const url = new URL(request.url);
    return url.pathname.endsWith("/posts") && url.searchParams.get("limit") === "10";
  });
  assert.equal(new URL(midQuery.url).searchParams.getAll("created_at").length, 2);
  assert.ok(requests.every((request) => request.headers.get("Authorization") === `Bearer ${token}`));
});

test("following feed derives followed authors from AfuAuth and returns hydrated items", async () => {
  const token = "discover-following-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const authorId = "123e4567-e89b-42d3-a456-426614174098";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/follows")) {
      return Response.json([{ following_id: authorId }]);
    }
    if (url.pathname.endsWith("/posts")) {
      assert.equal(url.searchParams.get("author_id"), `in.(${authorId})`);
      return Response.json([{
        id: postId,
        author_id: authorId,
        content: "Following",
        image_url: null,
        created_at: "2026-10-07T12:00:00.000Z",
        view_count: 5,
        like_count: 2,
        visibility: "followers",
        post_type: "post",
        video_asset_id: null,
      }]);
    }
    if (url.pathname.endsWith("/profiles")) {
      return Response.json([{
        id: authorId,
        display_name: "Followed author",
        handle: "followed",
        avatar_url: null,
        bio: null,
        is_verified: false,
        is_organization_verified: false,
        country: null,
        interests: [],
        hide_posts_non_followers: false,
      }]);
    }
    if (url.pathname.endsWith("/post_images") ||
        url.pathname.endsWith("/post_acknowledgments") ||
        url.pathname.endsWith("/post_replies")) return Response.json([]);
    return Response.json({ error: "unexpected query" }, { status: 404 });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/feed/following?limit=20&newer_than=2026-10-07T11%3A00%3A00.000Z", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.following_ids, [authorId]);
  assert.equal(payload.items[0].id, postId);
  assert.equal(payload.items[0].isFollowing, true);
  assert.equal(new URL(requests.find((request) =>
    new URL(request.url).pathname.endsWith("/posts")
  ).url).searchParams.get("created_at"), "gt.2026-10-07T11:00:00.000Z");
});

test("post view batches derive the viewer from AfuAuth and reject stale accounts", async () => {
  const token = "post-views-session";
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  const postId = "123e4567-e89b-42d3-a456-426614174123";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  let insertRequest;
  let postgrestCalls = 0;
  globalThis.fetch = async (input, init) => {
    postgrestCalls += 1;
    insertRequest = new Request(input, init);
    return new Response(null, { status: 201 });
  };

  const recorded = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/feed/views", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ post_ids: [postId], expected_user_id: userId }),
    }),
    env,
  );
  assert.equal(recorded.status, 200);
  assert.deepEqual(await recorded.json(), { recorded: true, count: 1 });
  assert.deepEqual(await insertRequest.json(), [{ post_id: postId, viewer_id: userId }]);
  assert.equal(insertRequest.headers.get("Authorization"), `Bearer ${token}`);

  const stale = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/feed/views", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_ids: [postId],
        expected_user_id: "123e4567-e89b-42d3-a456-426614174000",
      }),
    }),
    env,
  );
  assert.equal(stale.status, 409);
  assert.equal(postgrestCalls, 1);
});

test("post search only returns public results and hydrates account profiles and video duration", async () => {
  const token = "post-search-session";
  const authorId = "123e4567-e89b-42d3-a456-426614174002";
  const assetId = "123e4567-e89b-42d3-a456-426614174003";
  const postId = "123e4567-e89b-42d3-a456-426614174004";
  const requests = [];
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "123e4567-e89b-42d3-a456-426614174001" }, accessToken: token });
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/posts")) {
      return Response.json([{
        id: postId,
        author_id: authorId,
        content: "A public clip",
        video_url: "https://cdn.afuchat.com/chat/clip.mp4",
        video_asset_id: assetId,
        view_count: 12,
        created_at: "2026-10-08T10:00:00.000Z",
      }]);
    }
    if (url.pathname.endsWith("/profiles")) {
      assert.equal(request.headers.get("Accept-Profile"), "accounts");
      return Response.json([{
        id: authorId,
        display_name: "Clip author",
        handle: "clipauthor",
        avatar_url: null,
      }]);
    }
    if (url.pathname.endsWith("/video_assets")) {
      return Response.json([{ id: assetId, duration_seconds: 18 }]);
    }
    throw new Error(`Unexpected Supabase path ${url.pathname}`);
  };

  const response = await worker.fetch(
    new Request(
      "https://api.afuchat.com/v1/chat/posts/search?kind=videos&query=clip&sort=recent&since=2026-10-01T00%3A00%3A00.000Z&limit=8",
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].id, postId);
  assert.equal(payload.items[0].profiles.handle, "clipauthor");
  assert.deepEqual(payload.items[0].video_assets, [{ duration_seconds: 18 }]);
  const postQuery = new URL(requests.find((request) =>
    new URL(request.url).pathname.endsWith("/posts")
  ).url).searchParams;
  assert.equal(postQuery.get("visibility"), "eq.public");
  assert.equal(postQuery.get("post_type"), "eq.video");
  assert.equal(postQuery.get("video_url"), "not.is.null");
  assert.equal(postQuery.get("content"), "ilike.%clip%");
  assert.equal(postQuery.get("created_at"), "gte.2026-10-01T00:00:00.000Z");
});

test("trending hashtags preserve the app ranking and reject malformed search input", async () => {
  const token = "trending-hashtag-session";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: "user-123" }, accessToken: token });
  let postgrestCalls = 0;
  globalThis.fetch = async (input, init) => {
    postgrestCalls += 1;
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(request.url).searchParams.get("content"), "ilike.%#%");
    return Response.json([
      { content: "#Afu #afu", view_count: 4 },
      { content: "#Build", view_count: 0 },
    ]);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/posts/trending/hashtags", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [
      { tag: "afu", count: 2 },
      { tag: "build", count: 1 },
    ],
  });

  const invalid = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/posts/search?kind=unknown", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  assert.equal(invalid.status, 400);
  assert.equal(postgrestCalls, 1);
});

test("video following feed enforces visibility and hydrates counts from the shared account data", async () => {
  const token = "video-following-session";
  const userId = "123e4567-e89b-42d3-a456-426614174011";
  const authorId = "123e4567-e89b-42d3-a456-426614174012";
  const postId = "123e4567-e89b-42d3-a456-426614174013";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: userId }, accessToken: token });
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/follows")) {
      return Response.json([{ following_id: authorId }]);
    }
    if (url.pathname.endsWith("/posts")) {
      assert.equal(url.searchParams.get("author_id"), `in.(${authorId})`);
      assert.equal(url.searchParams.getAll("or").length, 2);
      assert.match(url.searchParams.getAll("or")[1], /visibility\.eq\.followers/);
      return Response.json([{
        id: postId,
        author_id: authorId,
        content: "Following clip",
        video_url: "https://cdn.afuchat.com/chat/following.mp4",
        image_url: null,
        created_at: "2026-10-08T10:00:00.000Z",
        audio_name: null,
        view_count: 77,
      }]);
    }
    if (url.pathname.endsWith("/profiles")) {
      assert.equal(request.headers.get("Accept-Profile"), "accounts");
      return Response.json([{
        id: authorId,
        display_name: "Following creator",
        handle: "creator",
        avatar_url: null,
        is_verified: true,
        is_organization_verified: false,
      }]);
    }
    if (url.pathname.endsWith("/post_acknowledgments")) {
      return Response.json(url.searchParams.has("user_id")
        ? [{ post_id: postId }]
        : [{ post_id: postId }, { post_id: postId }]);
    }
    if (url.pathname.endsWith("/post_replies")) {
      return Response.json([{ post_id: postId }, { post_id: postId }, { post_id: postId }]);
    }
    if (url.pathname.endsWith("/post_views")) {
      return Response.json([{ post_id: postId }, { post_id: postId }, { post_id: postId }, { post_id: postId }]);
    }
    throw new Error(`Unexpected Supabase path ${url.pathname}`);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/feed/videos?tab=following&limit=20&expected_user_id=${userId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].profile.handle, "creator");
  assert.equal(payload.items[0].isFollowing, true);
  assert.equal(payload.items[0].liked, true);
  assert.equal(payload.items[0].likeCount, 2);
  assert.equal(payload.items[0].replyCount, 3);
  assert.equal(payload.items[0].view_count, 4);
});

test("post metrics return exact activity counts through the named route", async () => {
  const token = "post-metrics-session";
  const postId = "123e4567-e89b-42d3-a456-426614174014";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({
      user: { id: "123e4567-e89b-42d3-a456-426614174015" },
      accessToken: token,
    });
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.searchParams.get("post_id"), `eq.${postId}`);
    assert.equal(new Headers(init?.headers).get("Prefer"), "count=exact");
    const total = url.pathname.endsWith("/post_acknowledgments")
      ? 9
      : url.pathname.endsWith("/post_replies")
        ? 5
        : 23;
    return Response.json([{ id: "row" }], {
      headers: { "Content-Range": `0-0/${total}` },
    });
  };

  const response = await worker.fetch(
    new Request(`https://api.afuchat.com/v1/chat/posts/${postId}/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    like_count: 9,
    reply_count: 5,
    view_count: 23,
  });
});

test("Discover active people requires the verified account and redacts hidden presence", async () => {
  let databaseCalls = 0;
  globalThis.fetch = async () => {
    databaseCalls += 1;
    return Response.json([]);
  };
  const unauthenticated = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/discover/people?mode=active"),
    makeEnv(),
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(databaseCalls, 0);

  const token = "discover-active-token";
  const viewerId = "123e4567-e89b-42d3-a456-426614174010";
  const personId = "123e4567-e89b-42d3-a456-426614174011";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    return Response.json({ user: { id: viewerId }, accessToken: token });
  };

  const seenRequests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    seenRequests.push({ request, url });
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    if (request.headers.get("Accept-Profile") === "public") {
      assert.equal(url.searchParams.get("id"), `neq.${viewerId}`);
      assert.equal(url.searchParams.get("hide_from_search"), null);
      assert.equal(
        url.searchParams.get("or"),
        "(hide_from_search.is.null,hide_from_search.eq.false)",
      );
      assert.equal(url.searchParams.get("show_online_status"), null);
      assert.match(url.searchParams.get("select"), /show_online_status/);
      return Response.json([{
        id: personId,
        display_name: "Visible person",
        handle: "visible",
        avatar_url: "https://cdn.example.test/avatar.jpg",
        bio: "A public bio",
        follower_count: 3,
        is_verified: false,
        is_organization_verified: false,
        last_seen: "2026-10-08T07:00:00.000Z",
        show_online_status: false,
      }]);
    }
    assert.equal(request.headers.get("Accept-Profile"), "accounts");
    return Response.json([{
      id: personId,
      display_name: "Visible person",
      handle: "visible",
      avatar_url: "https://cdn.example.test/avatar.jpg",
      bio: "A public bio",
      is_verified: false,
      is_organization_verified: false,
    }]);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/discover/people?mode=active&expected_user_id=${viewerId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].id, personId);
  assert.equal(payload.items[0].last_seen, null);
  assert.equal("show_online_status" in payload.items[0], false);
  assert.equal(seenRequests.length, 2);
});

test("Discover suggested people excludes self and followed accounts with privacy filters", async () => {
  const token = "discover-suggested-token";
  const viewerId = "123e4567-e89b-42d3-a456-426614174020";
  const followedId = "123e4567-e89b-42d3-a456-426614174021";
  const suggestedId = "123e4567-e89b-42d3-a456-426614174022";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: viewerId }, accessToken: token });

  let candidateQuery;
  let followQuery;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    if (url.pathname.endsWith("/follows")) {
      followQuery = url;
      return Response.json([{ following_id: followedId }]);
    }
    assert.ok(url.pathname.endsWith("/profiles"));
    if (request.headers.get("Accept-Profile") === "public") {
      candidateQuery = url;
      return Response.json([
        { id: viewerId, display_name: "Viewer", handle: "viewer" },
        { id: followedId, display_name: "Already followed", handle: "followed" },
        { id: suggestedId, display_name: "Suggestion", handle: "suggestion" },
      ]);
    }
    assert.equal(request.headers.get("Accept-Profile"), "accounts");
    return Response.json([{
      id: suggestedId,
      display_name: "Suggestion",
      handle: "suggestion",
      avatar_url: "https://cdn.example.test/suggestion.jpg",
      bio: "A public bio",
      is_verified: false,
      is_organization_verified: false,
    }]);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/discover/people?mode=suggested&expected_user_id=${viewerId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.items.map((person) => person.id), [suggestedId]);
  assert.equal(followQuery.searchParams.get("follower_id"), `eq.${viewerId}`);
  assert.equal(candidateQuery.searchParams.get("onboarding_completed"), "eq.true");
  assert.equal(candidateQuery.searchParams.get("is_banned"), "eq.false");
  assert.equal(candidateQuery.searchParams.get("account_deleted"), "eq.false");
  assert.equal(
    candidateQuery.searchParams.get("or"),
    "(hide_from_search.is.null,hide_from_search.eq.false)",
  );
});

test("Discover directory returns relationship counts through the authenticated people API", async () => {
  const token = "discover-directory-token";
  const viewerId = "123e4567-e89b-42d3-a456-426614174023";
  const personId = "123e4567-e89b-42d3-a456-426614174024";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: viewerId }, accessToken: token });

  let candidateQuery;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    if (request.headers.get("Accept-Profile") === "public") {
      candidateQuery = url;
      return Response.json([{
        id: personId,
        display_name: "Directory person",
        handle: "directory-person",
        avatar_url: "https://cdn.example.test/directory.jpg",
        bio: "A directory profile",
        follower_count: 12,
        following_count: 7,
        is_verified: false,
        is_organization_verified: false,
        country: "Uganda",
        interests: ["tech"],
        last_seen: null,
      }]);
    }
    assert.equal(request.headers.get("Accept-Profile"), "accounts");
    return Response.json([{
      id: personId,
      display_name: "Directory person",
      handle: "directory-person",
      avatar_url: "https://cdn.example.test/directory.jpg",
      bio: "A directory profile",
      is_verified: false,
      is_organization_verified: false,
    }]);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/discover/people?mode=directory&interest=tech&expected_user_id=${viewerId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(candidateQuery.searchParams.get("id"), `neq.${viewerId}`);
  assert.equal(candidateQuery.searchParams.get("interests"), "cs.{tech}");
  assert.equal(candidateQuery.searchParams.get("order"), "follower_count.desc");
  const payload = await response.json();
  assert.equal(payload.items[0].id, personId);
  assert.equal(payload.items[0].follower_count, 12);
  assert.equal(payload.items[0].following_count, 7);
});

test("Discover nearby derives the excluded account from AfuAuth and returns server results", async () => {
  const token = "discover-nearby-token";
  const viewerId = "123e4567-e89b-42d3-a456-426614174025";
  const personId = "123e4567-e89b-42d3-a456-426614174026";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: viewerId }, accessToken: token });

  let databaseCalls = 0;
  globalThis.fetch = async (input, init) => {
    databaseCalls += 1;
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.pathname, "/rest/v1/rpc/nearby_users");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    assert.deepEqual(await request.json(), {
      user_lat: 0.3,
      user_lng: 32.6,
      radius_km: 10,
      exclude_id: viewerId,
    });
    return Response.json([{
      id: personId,
      display_name: "Nearby person",
      handle: "nearby-person",
      follower_count: 4,
      following_count: 9,
      distance_km: 2.1,
      location_updated_at: "2026-10-08T07:00:00.000Z",
    }]);
  };

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/discover/nearby?latitude=0.3&longitude=32.6&radius_km=10&expected_user_id=${viewerId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items[0].id, personId);
  assert.equal(payload.items[0].follower_count, 4);
  assert.equal(payload.items[0].following_count, 9);
  assert.equal(databaseCalls, 1);

  const staleAccountResponse = await worker.fetch(
    new Request(
      "https://api.afuchat.com/v1/chat/discover/nearby?latitude=0.3&longitude=32.6&radius_km=10&expected_user_id=123e4567-e89b-42d3-a456-426614174027",
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(staleAccountResponse.status, 409);
  assert.equal(databaseCalls, 1);
});

test("Discover presence heartbeat verifies the shared identity and only updates that account", async () => {
  const token = "discover-presence-token";
  const viewerId = "123e4567-e89b-42d3-a456-426614174030";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: viewerId }, accessToken: token });

  let databaseCalls = 0;
  globalThis.fetch = async (input, init) => {
    databaseCalls += 1;
    const request = new Request(input, init);
    assert.equal(request.method, "POST");
    assert.equal(new URL(request.url).pathname, "/rest/v1/rpc/update_last_seen");
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    assert.deepEqual(await request.json(), {});
    return Response.json(null);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/discover/presence", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expected_user_id: viewerId }),
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updated: true });
  assert.equal(databaseCalls, 1);

  const staleAccountResponse = await worker.fetch(
    new Request("https://api.afuchat.com/v1/chat/discover/presence", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expected_user_id: "123e4567-e89b-42d3-a456-426614174031",
      }),
    }),
    env,
  );
  assert.equal(staleAccountResponse.status, 400);
  assert.equal(databaseCalls, 1);
});

test("Discover people reports sanitized API errors instead of returning an empty list", async () => {
  const token = "discover-error-token";
  const viewerId = "123e4567-e89b-42d3-a456-426614174040";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: viewerId }, accessToken: token });
  globalThis.fetch = async () => Response.json(
    { code: "42501", message: "sensitive profile policy detail" },
    { status: 403 },
  );

  const response = await worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/discover/people?mode=active&expected_user_id=${viewerId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.equal(payload.error, "People could not be loaded.");
  assert.equal(JSON.stringify(payload).includes("sensitive profile policy detail"), false);
});

test("Discover follow-state reads return the signed-in user's followers and following IDs", async () => {
  const token = "discover-follow-ids-token";
  const viewerId = "123e4567-e89b-42d3-a456-426614174050";
  const followerId = "123e4567-e89b-42d3-a456-426614174051";
  const followingId = "123e4567-e89b-42d3-a456-426614174052";
  const env = makeEnv();
  env.AFUAUTH_API.fetch = async () =>
    Response.json({ user: { id: viewerId }, accessToken: token });

  const relationshipQueries = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.headers.get("Authorization"), `Bearer ${token}`);
    if (request.headers.get("Accept-Profile") === "accounts") {
      assert.equal(url.searchParams.get("id"), `eq.${viewerId}`);
      return Response.json([{
        id: viewerId,
        hide_followers_list: false,
        hide_following_list: false,
      }]);
    }

    relationshipQueries.push(url);
    if (url.searchParams.has("following_id")) {
      assert.equal(url.searchParams.get("following_id"), `eq.${viewerId}`);
      return Response.json([{
        follower_id: followerId,
        following_id: viewerId,
        created_at: "2026-10-08T08:00:00.000Z",
      }]);
    }
    assert.equal(url.searchParams.get("follower_id"), `eq.${viewerId}`);
    return Response.json([{
      follower_id: viewerId,
      following_id: followingId,
      created_at: "2026-10-08T08:01:00.000Z",
    }]);
  };

  const readIds = async (direction) => worker.fetch(
    new Request(
      `https://api.afuchat.com/v1/chat/follows/ids?profile_id=${viewerId}&direction=${direction}&limit=100&offset=0`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
    env,
  );
  const followersResponse = await readIds("followers");
  const followingResponse = await readIds("following");

  assert.equal(followersResponse.status, 200);
  assert.deepEqual((await followersResponse.json()).items, [followerId]);
  assert.equal(followingResponse.status, 200);
  assert.deepEqual((await followingResponse.json()).items, [followingId]);
  assert.equal(relationshipQueries.length, 2);
});
