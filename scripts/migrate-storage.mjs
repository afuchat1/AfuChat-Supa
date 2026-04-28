#!/usr/bin/env node
/**
 * Supabase Storage → Cloudflare R2 migration
 * ──────────────────────────────────────────
 *
 * Walks every object in every Supabase Storage bucket listed below and copies
 * it to the configured R2 bucket under the key `<bucket>/<original-path>`.
 * Then rewrites every DB column that points to a Supabase Storage URL so it
 * points to the new R2 public URL instead.
 *
 * Required env vars:
 *   SUPABASE_URL                 (or EXPO_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CLOUDFLARE_ACCOUNT_ID        (or R2_S3_ENDPOINT)
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   R2_BUCKET                    default: afuchat-media
 *   R2_PUBLIC_BASE_URL           e.g. https://cdn.afuchat.com
 *   DATABASE_URL                 Postgres connection string for URL rewrites
 *                                (Supabase project DB or any DB hosting the
 *                                relevant tables — must contain the same
 *                                schema as the app).
 *
 * Optional flags:
 *   --buckets=avatars,videos     Restrict to specific logical buckets
 *   --dry-run                    Don't write anything, just report
 *   --skip-copy                  Skip object copy phase
 *   --skip-rewrite               Skip DB URL rewrite phase
 *   --concurrency=8              Parallel object copies
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Client as PgClient } from "pg";
import { Readable } from "node:stream";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_ENDPOINT =
  process.env.R2_S3_ENDPOINT ||
  (ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const R2_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "afuchat-media";
const R2_PUBLIC = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const DATABASE_URL = process.env.DATABASE_URL;

const ALL_BUCKETS = [
  "avatars",
  "banners",
  "post-images",
  "videos",
  "stories",
  "group-avatars",
  "chat-media",
  "voice-messages",
  "shop-media",
  "match-photos",
];

const buckets = args.buckets ? args.buckets.split(",") : ALL_BUCKETS;
const dryRun = args["dry-run"] === "true";
const skipCopy = args["skip-copy"] === "true";
const skipRewrite = args["skip-rewrite"] === "true";
const concurrency = Number(args.concurrency || 8);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail("SUPABASE_URL is required");
if (!SERVICE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY is required");
if (!skipCopy && (!R2_ENDPOINT || !R2_KEY || !R2_SECRET))
  fail("R2 credentials required for copy phase");
if (!skipRewrite && !DATABASE_URL) fail("DATABASE_URL required for rewrite phase");
if (!skipRewrite && !R2_PUBLIC) fail("R2_PUBLIC_BASE_URL required for rewrite phase");

const s3 =
  !skipCopy
    ? new S3Client({
        region: "auto",
        endpoint: R2_ENDPOINT,
        credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
      })
    : null;

// ─── Supabase Storage helpers ─────────────────────────────────────────────

const SB_HEADERS = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
  "Content-Type": "application/json",
};

async function listBucketRecursive(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: SB_HEADERS,
      body: JSON.stringify({
        prefix,
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`list ${bucket}/${prefix} failed (${r.status}): ${t.slice(0, 200)}`);
    }
    const items = await r.json();
    if (!Array.isArray(items)) throw new Error(`list ${bucket} bad response`);
    for (const it of items) {
      const fullPath = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null && it.metadata === null) {
        // Folder
        const sub = await listBucketRecursive(bucket, fullPath);
        out.push(...sub);
      } else {
        out.push({ path: fullPath, size: it.metadata?.size ?? 0, mime: it.metadata?.mimetype });
      }
    }
    if (items.length < limit) break;
    offset += limit;
  }
  return out;
}

async function downloadSupabaseObject(bucket, path) {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${enc}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  if (!r.ok) throw new Error(`download ${bucket}/${path} failed (${r.status})`);
  return {
    body: Readable.fromWeb(r.body),
    contentType: r.headers.get("content-type") || "application/octet-stream",
    size: Number(r.headers.get("content-length") || 0),
  };
}

async function r2HasObject(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyOne(bucket, item) {
  const key = `${bucket}/${item.path}`;
  if (await r2HasObject(key)) return { key, status: "exists" };
  if (dryRun) return { key, status: "would-copy" };

  const dl = await downloadSupabaseObject(bucket, item.path);
  await new Upload({
    client: s3,
    params: {
      Bucket: R2_BUCKET,
      Key: key,
      Body: dl.body,
      ContentType: dl.contentType,
      CacheControl: "public, max-age=31536000",
    },
  }).done();
  return { key, status: "copied", size: dl.size };
}

async function runWithConcurrency(items, worker, n) {
  const results = [];
  let i = 0;
  let completed = 0;
  const total = items.length;
  async function next() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        const r = await worker(items[idx]);
        results.push(r);
        completed++;
        if (completed % 25 === 0 || completed === total) {
          process.stdout.write(`  …${completed}/${total}\n`);
        }
      } catch (e) {
        completed++;
        results.push({ error: e.message, item: items[idx] });
        process.stdout.write(`  !! ${e.message}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: n }, next));
  return results;
}

// ─── Phase 1: copy objects ────────────────────────────────────────────────

const summary = { buckets: {}, totalCopied: 0, totalExists: 0, totalErrors: 0 };

if (!skipCopy) {
  for (const bucket of buckets) {
    console.log(`\n[copy] bucket=${bucket}`);
    let items;
    try {
      items = await listBucketRecursive(bucket);
    } catch (e) {
      console.error(`  list failed: ${e.message}`);
      summary.buckets[bucket] = { listError: e.message };
      continue;
    }
    console.log(`  ${items.length} objects`);
    if (!items.length) {
      summary.buckets[bucket] = { count: 0 };
      continue;
    }
    const results = await runWithConcurrency(
      items,
      (it) => copyOne(bucket, it),
      concurrency,
    );
    const copied = results.filter((r) => r.status === "copied").length;
    const exists = results.filter((r) => r.status === "exists").length;
    const errors = results.filter((r) => r.error).length;
    summary.buckets[bucket] = { count: items.length, copied, exists, errors };
    summary.totalCopied += copied;
    summary.totalExists += exists;
    summary.totalErrors += errors;
    console.log(`  done: copied=${copied} skipped=${exists} errors=${errors}`);
  }
  console.log(`\n[copy summary] copied=${summary.totalCopied} skipped=${summary.totalExists} errors=${summary.totalErrors}`);
}

// ─── Phase 2: rewrite DB URLs ─────────────────────────────────────────────

if (!skipRewrite) {
  console.log(`\n[rewrite] connecting to DATABASE_URL`);
  const pg = new PgClient({ connectionString: DATABASE_URL });
  await pg.connect();

  const oldPrefix = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/`;
  const newPrefix = `${R2_PUBLIC}/`;

  // table, column, [opt: extra WHERE]
  const targets = [
    ["public.profiles", "avatar_url"],
    ["public.profiles", "banner_url"],
    ["public.posts", "image_url"],
    ["public.posts", "video_url"],
    ["public.post_images", "image_url"],
    ["public.mini_apps", "icon_url"],
    ["public.video_assets", "source_path"],
    ["public.video_assets", "poster_path"],
    ["public.video_renditions", "storage_path"],
    ["public.match_profiles", "media_url"],
    ["public.match_photos", "url"],
  ];

  for (const [table, col] of targets) {
    try {
      const sql = `UPDATE ${table} SET ${col} = REPLACE(${col}, $1, $2) WHERE ${col} LIKE $3`;
      const params = [oldPrefix, newPrefix, oldPrefix + "%"];
      if (dryRun) {
        const r = await pg.query(
          `SELECT count(*)::int AS n FROM ${table} WHERE ${col} LIKE $1`,
          [oldPrefix + "%"],
        );
        console.log(`  [dry] ${table}.${col}: ${r.rows[0].n} rows would be rewritten`);
      } else {
        const r = await pg.query(sql, params);
        console.log(`  ${table}.${col}: ${r.rowCount} rows rewritten`);
      }
    } catch (e) {
      console.error(`  ${table}.${col}: ${e.message}`);
    }
  }

  await pg.end();
}

console.log("\nDONE");
