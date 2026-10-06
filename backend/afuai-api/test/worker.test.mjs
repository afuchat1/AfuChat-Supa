import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeEnv(apiKey = "test-engagera-key") {
  return {
    ENGAGERA_API_KEY: apiKey,
    AFUAUTH_API: {
      async fetch(input) {
        const request = input instanceof Request ? input : new Request(input);
        const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        return Response.json({ user: { id: "user-123" }, accessToken: token });
      },
    },
  };
}

test("AfuAI health is degraded until the Engagera secret is configured", async () => {
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/ai/healthz"),
    makeEnv(""),
  );
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.worker, "afuai-api");
  assert.equal(payload.configuration.engagera, false);
});

test("AfuAI rejects requests without a shared AfuAuth session", async () => {
  const env = makeEnv();
  let authCalls = 0;
  env.AFUAUTH_API.fetch = async () => {
    authCalls += 1;
    return Response.json({ user: { id: "user-123" }, accessToken: "unexpected" });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    }),
    env,
  );

  assert.equal(response.status, 401);
  assert.equal(authCalls, 0);
});

test("AfuAI verifies the shared session before calling Engagera", async () => {
  const env = makeEnv();
  const token = "shared-supabase-session";
  let authRequest;
  let providerRequest;
  env.AFUAUTH_API.fetch = async (input) => {
    authRequest = input instanceof Request ? input : new Request(input);
    return Response.json({ user: { id: "user-123" }, accessToken: token });
  };
  globalThis.fetch = async (input, init) => {
    providerRequest = input instanceof Request ? input : new Request(input, init);
    return Response.json({ message: { content: "AfuAI response" } });
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/v1/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    }),
    env,
  );
  const payload = await response.json();

  assert.equal(new URL(authRequest.url).pathname, "/v1/auth/session");
  assert.equal(authRequest.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(new URL(providerRequest.url).host, "api.engagera.ai");
  assert.equal(providerRequest.headers.get("x-engagera-api-key"), "test-engagera-key");
  assert.equal(response.status, 200);
  assert.equal(payload.content, "AfuAI response");
});
