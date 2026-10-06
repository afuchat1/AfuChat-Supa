import assert from "node:assert/strict";
import { test } from "node:test";
import { handleR2CdnRequest } from "./r2-cdn.ts";

const bytes = new TextEncoder().encode("abcdef");

function makeObject(bodyBytes = bytes) {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bodyBytes);
        controller.close();
      },
    }),
    size: bytes.length,
    etag: "audit-etag",
    httpEtag: '"audit-etag"',
    uploaded: new Date("2026-10-06T00:00:00.000Z"),
    httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=600" },
    writeHttpMetadata(headers) {
      headers.set("Content-Type", this.httpMetadata.contentType);
      headers.set("Cache-Control", this.httpMetadata.cacheControl);
    },
  };
}

function makeBucket(existingKey = "sample/image.jpg") {
  const calls = { head: 0, get: 0, lastRange: undefined };
  return {
    calls,
    async head(key) {
      calls.head += 1;
      return key === existingKey ? makeObject() : null;
    },
    async get(key, options) {
      calls.get += 1;
      calls.lastRange = options?.range;
      if (key !== existingKey) return null;
      const partial = options?.range
        ? bytes.subarray(
            options.range.offset,
            options.range.offset + options.range.length,
          )
        : bytes;
      return makeObject(partial);
    },
  };
}

test("serves an object only from its product prefix with stored headers", async () => {
  const bucket = makeBucket();
  const response = await handleR2CdnRequest(
    new Request("https://cdn.afuchat.com/cloud/sample/image.jpg"),
    bucket,
    "cloud",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Afu-Storage-Product"), "cloud");
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=600");
  assert.equal(response.headers.get("ETag"), '"audit-etag"');
  assert.equal(await response.text(), "abcdef");
  assert.equal(bucket.calls.head, 1);
  assert.equal(bucket.calls.get, 1);
});

test("supports HEAD without reading an object body", async () => {
  const bucket = makeBucket();
  const response = await handleR2CdnRequest(
    new Request("https://cdn.afuchat.com/mail/sample/image.jpg", { method: "HEAD" }),
    bucket,
    "mail",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Length"), String(bytes.length));
  assert.equal(await response.text(), "");
  assert.equal(bucket.calls.get, 0);
});

test("supports byte ranges and returns the matching range headers", async () => {
  const bucket = makeBucket();
  const response = await handleR2CdnRequest(
    new Request("https://cdn.afuchat.com/ads/sample/image.jpg", {
      headers: { Range: "bytes=1-3" },
    }),
    bucket,
    "ads",
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 1-3/6");
  assert.equal(response.headers.get("Content-Length"), "3");
  assert.deepEqual(bucket.calls.lastRange, { offset: 1, length: 3 });
  assert.equal(await response.text(), "bcd");
});

test("does not let a different prefix or hostname read the bound bucket", async () => {
  const bucket = makeBucket();
  const wrongPrefix = await handleR2CdnRequest(
    new Request("https://cdn.afuchat.com/ai/sample/image.jpg"),
    bucket,
    "cloud",
  );
  const wrongHost = await handleR2CdnRequest(
    new Request("https://api.afuchat.com/cloud/sample/image.jpg"),
    bucket,
    "cloud",
  );

  assert.equal(wrongPrefix.status, 404);
  assert.equal(wrongHost.status, 404);
  assert.equal(bucket.calls.head, 0);
  assert.equal(bucket.calls.get, 0);
});

test("returns an isolated empty-bucket 404 without cacheable error responses", async () => {
  const bucket = makeBucket();
  const response = await handleR2CdnRequest(
    new Request("https://cdn.afuchat.com/ai/not-yet-uploaded.jpg"),
    bucket,
    "ai",
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("X-Afu-Storage-Product"), "ai");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(bucket.calls.head, 1);
});

test("all product namespace roots are not parsed as object keys or looked up in R2", async () => {
  for (const product of ["chat", "mail", "cloud", "ai", "ads"]) {
    for (const suffix of ["", "/"]) {
      const bucket = makeBucket();
      const response = await handleR2CdnRequest(
        new Request(`https://cdn.afuchat.com/${product}${suffix}`),
        bucket,
        product,
      );

      assert.equal(response.status, 404, `${product}${suffix}`);
      assert.equal(await response.text(), "The requested media object was not found.");
      assert.equal(bucket.calls.head, 0);
      assert.equal(bucket.calls.get, 0);
      if (suffix === "/") {
        const preflight = await handleR2CdnRequest(
          new Request(`https://cdn.afuchat.com/${product}/`, { method: "OPTIONS" }),
          bucket,
          product,
        );
        assert.equal(preflight.status, 204);
        assert.equal(bucket.calls.head, 0);
        assert.equal(bucket.calls.get, 0);
      }
    }
  }
});

test("R2 failures return generic public errors", async () => {
  const bucket = {
    async head() {
      throw new Error("internal bucket binding and hostname details");
    },
    async get() {
      throw new Error("internal bucket binding and hostname details");
    },
  };
  const response = await handleR2CdnRequest(
    new Request("https://cdn.afuchat.com/ai/sample/image.jpg"),
    bucket,
    "ai",
  );

  assert.equal(response.status, 503);
  assert.equal(await response.text(), "The media service is temporarily unavailable.");
});

test("supports conditional requests and rejects invalid byte ranges", async () => {
  const bucket = makeBucket();
  const notModified = await handleR2CdnRequest(
    new Request("https://cdn.afuchat.com/cloud/sample/image.jpg", {
      headers: { "If-None-Match": '"audit-etag"' },
    }),
    bucket,
    "cloud",
  );
  const invalidRange = await handleR2CdnRequest(
    new Request("https://cdn.afuchat.com/cloud/sample/image.jpg", {
      headers: { Range: "bytes=99-100" },
    }),
    bucket,
    "cloud",
  );

  assert.equal(notModified.status, 304);
  assert.equal(invalidRange.status, 416);
  assert.equal(invalidRange.headers.get("Content-Range"), "bytes */6");
});
