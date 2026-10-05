import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.ts";

const originalFetch = globalThis.fetch;
const env = {
  SUPABASE_URL: "https://supabase.example.test",
  SUPABASE_SERVICE_KEY: "test-service-key",
  AFUCHAT_SUPABASE_URL: "https://supabase.example.test",
  AFUCHAT_SUPABASE_ANON_KEY: "test-anon-key",
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("health endpoint responds without a Supabase session", async () => {
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/auth/healthz"),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).worker, "afuauth-api");
});

test("session verifies and returns the shared Supabase identity without minting a token", async () => {
  const token = "shared-supabase-session";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://supabase.example.test/auth/v1/user");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
    return Response.json({
      id: "user-123",
      email: "member@example.test",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      user_metadata: { name: "Member" },
    });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/auth/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.user.id, "user-123");
  assert.equal(body.user.email, "member@example.test");
  assert.equal(body.accessToken, token);
  assert.equal("refreshToken" in body, false);
});

test("session rejects a Supabase token that Auth does not recognize", async () => {
  globalThis.fetch = async () => Response.json({ message: "invalid token" }, { status: 401 });
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/auth/session", {
      method: "POST",
      headers: { Authorization: "Bearer expired-token" },
    }),
    env,
  );
  assert.equal(response.status, 401);
});

test("legacy username resolver reads only the matching email", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).pathname, "/rest/v1/profiles");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-service-key");
    assert.equal(new Headers(init?.headers).get("Accept-Profile"), "public");
    assert.match(new URL(String(input)).search, /handle=eq\.alice/);
    return Response.json([{ email: "member@example.test" }]);
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/auth-resolve-identifier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "alice" }),
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { email: "member@example.test" });
});
