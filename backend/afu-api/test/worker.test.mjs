import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { resolveService } from "../src/index.mjs";

test("gateway forwards only the API root and explicit auth resolver to AfuAuth", () => {
  const cases = [
    ["/", "AFUAUTH_API"],
    ["/v1/auth-resolve-identifier", "AFUAUTH_API"],
  ];

  for (const [pathname, expectedService] of cases) {
    assert.equal(resolveService(pathname), expectedService, pathname);
  }

  for (const pathname of [
    "/v1/auth/healthz",
    "/v1/chat/healthz",
    "/chat/rest/v1/profiles",
    "/v1/storage/usage",
    "/v1/cloud/healthz",
    "/v1/ai/healthz",
    "/v1/ads/healthz",
    "/v1/mail/healthz",
  ]) {
    assert.equal(resolveService(pathname), null, pathname);
  }
});

test("namespace matching does not capture neighboring paths", () => {
  for (const pathname of [
    "/v1/chats",
    "/v1/authors",
    "/v1/cloudy",
    "/v1/aids",
    "/v1/ads-extra",
    "/v1/mailing",
    "/unassigned",
  ]) {
    assert.equal(resolveService(pathname), null, pathname);
  }
});

test("gateway preserves the request when forwarding through a service binding", async () => {
  let forwarded;
  const env = {
    AFUAUTH_API: {
      async fetch(request) {
        forwarded = request;
        return Response.json({ handledBy: "afuauth-api" });
      },
    },
  };
  const request = new Request(
    "https://api.afuchat.com/v1/auth-resolve-identifier?source=mobile",
    {
      method: "POST",
      headers: {
        authorization: "Bearer session-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ identifier: "preserve me" }),
    },
  );

  const response = await worker.fetch(request, env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { handledBy: "afuauth-api" });
  assert.equal(forwarded.url, request.url);
  assert.equal(forwarded.method, "POST");
  assert.equal(forwarded.headers.get("authorization"), "Bearer session-token");
  assert.deepEqual(await forwarded.json(), { identifier: "preserve me" });
});

test("unknown paths return a gateway 404 instead of falling through to an origin", async () => {
  let called = false;
  const env = {
    AFUAUTH_API: { fetch: async () => { called = true; return new Response(); } },
  };

  const response = await worker.fetch(
    new Request("https://api.afuchat.com/unassigned"),
    env,
  );

  assert.equal(response.status, 404);
  assert.equal((await response.json()).worker, "afu-api");
  assert.equal(called, false);
});

test("gateway rejects other hostnames", async () => {
  const response = await worker.fetch(
    new Request("https://afu-api.afuchatgroup.workers.dev/v1/chat/healthz"),
    {},
  );
  assert.equal(response.status, 404);
});

test("missing service bindings fail explicitly", async () => {
  const response = await worker.fetch(
    new Request("https://api.afuchat.com/"),
    {},
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).service, "AFUAUTH_API");
});
