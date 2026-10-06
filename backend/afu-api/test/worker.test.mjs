import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { resolveService } from "../src/index.mjs";

test("root gateway owns only the API root and does not absorb product routes", async () => {
  assert.equal(resolveService("/"), "AFUAUTH_API");
  const forwarded = [];
  const env = {
    AFUAUTH_API: {
      fetch: async (request) => {
        forwarded.push(new URL(request.url).pathname);
        return new Response("root handled by auth gateway");
      },
    },
  };
  const rootResponse = await worker.fetch(
    new Request("https://api.afuchat.com/"),
    env,
  );
  assert.equal(rootResponse.status, 200);
  assert.deepEqual(forwarded, ["/"]);

  const sanitized = await worker.fetch(
    new Request("https://api.afuchat.com/"),
    {
      AFUAUTH_API: {
        fetch: async () => Response.json({
          name: "AfuAuth API",
          worker: "afuauth-api",
          services: { database: { hostname: "internal.example" } },
          health: "/v1/auth/healthz",
        }, { headers: { "X-Worker-Name": "afuauth-api", "X-Cloudflare-Worker": "edge" } }),
      },
    },
  );
  assert.deepEqual(await sanitized.json(), {
    name: "AfuAuth API",
    health: "/v1/auth/healthz",
  });
  assert.equal(sanitized.headers.get("X-Worker-Name"), null);
  assert.equal(sanitized.headers.get("X-Cloudflare-Worker"), null);

  for (const pathname of [
    "/v1/auth-resolve-identifier",
    "/v1/auth/healthz",
    "/v1/chat/healthz",
    "/afucloud/v1/projects",
    "/v1/storage/usage",
  ]) {
    assert.equal(resolveService(pathname), null, pathname);
    const response = await worker.fetch(
      new Request(`https://api.afuchat.com${pathname}`),
      env,
    );
    assert.equal(response.status, 404, pathname);
    assert.deepEqual(await response.json(), {
      error: "The requested API endpoint was not found.",
    });
  }
});

test("gateway errors do not expose bindings, worker names, paths, or upstream details", async () => {
  const unavailable = await worker.fetch(
    new Request("https://api.afuchat.com/"),
    {},
  );
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: "The requested API service is temporarily unavailable.",
  });

  const failed = await worker.fetch(
    new Request("https://api.afuchat.com/"),
    {
      AFUAUTH_API: {
        fetch: async () => Response.json({
          error: "database endpoint https://internal.example failed",
          worker: "afuauth-api",
        }, { status: 500 }),
      },
    },
  );
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), {
    error: "The requested API service could not complete this request.",
  });

  const unreachable = await worker.fetch(
    new Request("https://api.afuchat.com/"),
    {
      AFUAUTH_API: {
        fetch: async () => {
          throw new Error("internal service hostname and stack trace");
        },
      },
    },
  );
  assert.equal(unreachable.status, 502);
  assert.deepEqual(await unreachable.json(), {
    error: "The requested API service is temporarily unavailable.",
  });
});
