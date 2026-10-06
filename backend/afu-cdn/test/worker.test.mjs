import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.ts";

const bytes = new TextEncoder().encode("image-bytes");

function makeObject({ body = false, cacheControl } = {}) {
  return {
    ...(body
      ? {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
        }
      : {}),
    size: bytes.length,
    etag: "cdn-etag",
    httpEtag: '"cdn-etag"',
    uploaded: new Date("2026-10-06T00:00:00.000Z"),
    httpMetadata: { contentType: "image/jpeg", cacheControl },
    writeHttpMetadata(headers) {
      headers.set("Content-Type", this.httpMetadata.contentType);
      if (this.httpMetadata.cacheControl) {
        headers.set("Cache-Control", this.httpMetadata.cacheControl);
      }
    },
  };
}

function makeBucket(existingKey) {
  const calls = { head: [], get: [] };
  return {
    calls,
    async head(key) {
      calls.head.push(key);
      return key === existingKey ? makeObject() : null;
    },
    async get(key) {
      calls.get.push(key);
      return key === existingKey ? makeObject({ body: true }) : null;
    },
  };
}

function makeEnv(expectedBinding = "", expectedKey = "") {
  return {
    CHAT_ASSETS: makeBucket(expectedBinding === "CHAT_ASSETS" ? expectedKey : ""),
    CLOUD_ASSETS: makeBucket(expectedBinding === "CLOUD_ASSETS" ? expectedKey : ""),
    MAIL_ASSETS: makeBucket(expectedBinding === "MAIL_ASSETS" ? expectedKey : ""),
    AI_ASSETS: makeBucket(expectedBinding === "AI_ASSETS" ? expectedKey : ""),
    ADS_ASSETS: makeBucket(expectedBinding === "ADS_ASSETS" ? expectedKey : ""),
    LEGACY_MEDIA: makeBucket(expectedBinding === "LEGACY_MEDIA" ? expectedKey : ""),
  };
}

test("product namespaces dispatch through their configured R2 bindings", async () => {
  const cases = [
    {
      path: "/chat/containers/user-1/container-1/photo.jpg",
      binding: "CHAT_ASSETS",
      key: "containers/user-1/container-1/photo.jpg",
    },
    {
      path: "/cloud/user-1/project-1/123e4567-e89b-42d3-a456-426614174000.jpg",
      binding: "CLOUD_ASSETS",
      key: "user-1/project-1/123e4567-e89b-42d3-a456-426614174000.jpg",
    },
    { path: "/mail/messages/message-1/file.pdf", binding: "MAIL_ASSETS", key: "messages/message-1/file.pdf" },
    { path: "/ai/generated/image.webp", binding: "AI_ASSETS", key: "generated/image.webp" },
    { path: "/ads/campaigns/campaign-1/creative.png", binding: "ADS_ASSETS", key: "campaigns/campaign-1/creative.png" },
  ];

  for (const item of cases) {
    const env = makeEnv(item.binding, item.key);
    const response = await worker.fetch(new Request(`https://cdn.afuchat.com${item.path}`), env);

    assert.equal(response.status, 200, item.path);
    assert.equal(await response.text(), "image-bytes", item.path);
    assert.equal(response.headers.get("X-Afu-Storage-Product"), item.path.split("/")[1]);
    assert.ok(response.headers.get("X-AfuCdn-Request-Id"));
    for (const [binding, bucket] of Object.entries(env)) {
      assert.deepEqual(
        bucket.calls.head,
        binding === item.binding ? [item.key] : [],
        `${binding} must not be queried for ${item.path}`,
      );
    }
  }
});

test("Cloud UUID-named static objects get long immutable caching", async () => {
  const key = "user-1/project-1/123e4567-e89b-42d3-a456-426614174000.jpg";
  const env = makeEnv("CLOUD_ASSETS", key);
  const response = await worker.fetch(
    new Request(`https://cdn.afuchat.com/cloud/${key}`),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
});

test("unprefixed legacy URLs continue to read from afuchat-media", async () => {
  const key = "profiles/user-1/old-photo.jpg";
  const env = makeEnv("LEGACY_MEDIA", key);
  const response = await worker.fetch(
    new Request(`https://cdn.afuchat.com/${key}`),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "image-bytes");
  assert.equal(response.headers.get("X-Afu-Storage-Product"), null);
  assert.deepEqual(env.LEGACY_MEDIA.calls.head, [key]);
  for (const [binding, bucket] of Object.entries(env)) {
    if (binding !== "LEGACY_MEDIA") assert.deepEqual(bucket.calls.head, []);
  }
});

test("unknown future prefixes remain compatible with legacy root object keys", async () => {
  const key = "archive/old-object.webp";
  const env = makeEnv("LEGACY_MEDIA", key);
  const response = await worker.fetch(
    new Request(`https://cdn.afuchat.com/${key}`),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(env.LEGACY_MEDIA.calls.head, [key]);
});

test("product namespace roots are not treated as object keys", async () => {
  for (const product of ["chat", "cloud", "mail", "ai", "ads"]) {
    for (const suffix of ["", "/"]) {
      const env = makeEnv();
      const response = await worker.fetch(
        new Request(`https://cdn.afuchat.com/${product}${suffix}`),
        env,
      );

      assert.equal(response.status, 404, `${product}${suffix}`);
      assert.equal(await response.text(), "The requested media object was not found.");
      for (const bucket of Object.values(env)) {
        assert.deepEqual(bucket.calls.head, []);
        assert.deepEqual(bucket.calls.get, []);
      }
    }
  }
});

test("encoded product-prefix variants cannot bypass bucket isolation", async () => {
  const env = makeEnv("LEGACY_MEDIA", "%63hat/object.jpg");
  const response = await worker.fetch(
    new Request("https://cdn.afuchat.com/%63hat/object.jpg"),
    env,
  );

  assert.equal(response.status, 404);
  for (const bucket of Object.values(env)) {
    assert.deepEqual(bucket.calls.head, []);
    assert.deepEqual(bucket.calls.get, []);
  }
});

test("HEAD reads metadata without a body and OPTIONS does not read R2", async () => {
  const key = "assets/photo.jpg";
  const env = makeEnv("MAIL_ASSETS", key);
  const head = await worker.fetch(
    new Request(`https://cdn.afuchat.com/mail/${key}`, { method: "HEAD" }),
    env,
  );
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("Content-Length"), String(bytes.length));
  assert.equal(await head.text(), "");
  assert.deepEqual(env.MAIL_ASSETS.calls.get, []);

  const preflight = await worker.fetch(
    new Request("https://cdn.afuchat.com/mail/", { method: "OPTIONS" }),
    env,
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(env.MAIL_ASSETS.calls.head.length, 1);
  assert.equal(env.MAIL_ASSETS.calls.get.length, 0);
});

test("other hosts return generic errors without reading any bucket", async () => {
  const env = makeEnv();
  const response = await worker.fetch(
    new Request("https://img.afuchat.com/cloud/object.jpg"),
    env,
  );

  assert.equal(response.status, 404);
  assert.equal(await response.text(), "The requested media object was not found.");
  assert.ok(response.headers.get("X-AfuCdn-Request-Id"));
  for (const bucket of Object.values(env)) {
    assert.deepEqual(bucket.calls.head, []);
  }
});

test("R2 failures are logged internally and return generic public errors", async () => {
  const env = makeEnv();
  env.ADS_ASSETS = {
    calls: { head: [], get: [] },
    async head() {
      throw new Error("private bucket binding and origin details");
    },
    async get() {
      throw new Error("private bucket binding and origin details");
    },
  };
  const response = await worker.fetch(
    new Request("https://cdn.afuchat.com/ads/campaigns/private.png"),
    env,
  );
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.equal(body, "The media service is temporarily unavailable.");
  assert.doesNotMatch(body, /private bucket|origin details/);
  assert.ok(response.headers.get("X-AfuCdn-Request-Id"));
});
