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
    assert.equal((await response.json()).worker, "afu-api");
  }
});
