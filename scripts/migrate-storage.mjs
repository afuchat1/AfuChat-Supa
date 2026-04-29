#!/usr/bin/env node
/**
 * Supabase Storage → Cloudflare R2 migration
 * ──────────────────────────────────────────
 *
 * Phase 1 (copy):
 *   Auto-discovers every bucket in Supabase Storage and walks every object
 *   recursively, copying it to the configured R2 bucket under the key
 *   `<bucket>/<original-path>`. Idempotent — already-present R2 keys are
 *   skipped via HeadObject.
 *
 * Phase 2 (rewrite):
 *   Auto-discovers every text/varchar column in the public schema that
 *   contains '/storage/v1/object/' URLs and rewrites them to point at
 *   R2_PUBLIC_BASE_URL. Views are skipped automatically.
 *
 * Required env vars:
 *   SUPABASE_URL                 (or EXPO_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY    (for Storage API)
 *   SUPABASE_ACCESS_TOKEN        (for Management API SQL execution)
 *   SUPABASE_PROJECT_REF
 *   CLOUDFLARE_ACCOUNT_ID        (or R2_S3_ENDPOINT)
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   R2_BUCKET                    default: afuchat-media
 *   R2_PUBLIC_BASE_URL           e.g. https://cdn.afuchat.com
 *
 * Optional flags:
 *   --buckets=avatars,videos     Restrict to specific source buckets
 *   --dry-run                    Don't write anything, just report
 *   --skip-copy                  Skip object copy phase
 *   --skip-rewrite               Skip DB URL rewrite phase
 *   --concurrency=8              Parallel object copies
 */

import {
  S3Client,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "node:stream";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_ENDPOINT =
  process.env.R2_S3_ENDPOINT ||
  (ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const R2_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "afuchat-media";
const R2_PUBLIC = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

const dryRun = args["dry-run"] === "true";
const skipCopy = args["skip-copy"] === "true";
const skipRewrite = args["skip-rewrite"] === "true";
const concurrency = Number(args.concurrency || 8);
const bucketFilter = args.buckets ? args.buckets.split(",") : null;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail("SUPABASE_URL is required");
if (!SERVICE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY is required");
if (!skipRewrite && (!MGMT_TOKEN || !PROJECT_REF))
  fail("SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF required for rewrite phase");
if (!skipCopy && (!R2_ENDPOINT || !R2_KEY || !R2_SECRET))
  fail("R2 credentials required for copy phase");
if (!skipRewrite && !R2_PUBLIC)
  fail("R2_PUBLIC_BASE_URL required for rewrite phase");

const s3 = !skipCopy
  ? new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
    })
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Supabase Storage helpers ─────────────────────────────────────────────

const SB_HEADERS = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
  "Content-Type": "application/json",
};

async function listAllBuckets() {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    headers: SB_HEADERS,
  });
  if (!r.ok) throw new Error(`list buckets failed (${r.status}): ${await r.text()}`);
  const buckets = await r.json();
  return buckets.map((b) => b.name);
}

/** List one folder (single page, paginated) — returns files + subfolders. */
async function listFolder(bucket, prefix) {
  const files = [];
  const subfolders = [];
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
        subfolders.push(fullPath);
      } else {
        files.push({
          path: fullPath,
          size: it.metadata?.size ?? 0,
          mime: it.metadata?.mimetype,
        });
      }
    }
    if (items.length < limit) break;
    offset += limit;
  }
  return { files, subfolders };
}

/**
 * BFS-walk every folder in a bucket with parallel fan-out so listing
 * 200+ user folders takes seconds instead of minutes.
 */
async function listBucketRecursive(bucket, listConcurrency = 16) {
  const out = [];
  let frontier = [""];
  let depth = 0;
  while (frontier.length) {
    const nextFrontier = [];
    process.stdout.write(`  list depth=${depth} folders=${frontier.length}…\n`);
    for (let i = 0; i < frontier.length; i += listConcurrency) {
      const chunk = frontier.slice(i, i + listConcurrency);
      const results = await Promise.all(chunk.map((p) => listFolder(bucket, p)));
      for (const { files, subfolders } of results) {
        out.push(...files);
        nextFrontier.push(...subfolders);
      }
    }
    process.stdout.write(`    files+=${out.length}, next-depth folders=${nextFrontier.length}\n`);
    frontier = nextFrontier;
    depth++;
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

// ─── Management API SQL helper ───────────────────────────────────────────

async function mgmtSql(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MGMT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
    );
    if (r.status === 429) {
      const wait = 2000 * (attempt + 1);
      console.log(`  (rate limited, sleeping ${wait}ms)`);
      await sleep(wait);
      continue;
    }
    if (!r.ok) {
      throw new Error(`mgmt sql ${r.status}: ${(await r.text()).slice(0, 300)}`);
    }
    return r.json();
  }
  throw new Error("mgmt sql: rate limited too many times");
}

// ─── Phase 1: copy objects ────────────────────────────────────────────────

const summary = { buckets: {}, totalCopied: 0, totalExists: 0, totalErrors: 0 };

if (!skipCopy) {
  let buckets = await listAllBuckets();
  if (bucketFilter) buckets = buckets.filter((b) => bucketFilter.includes(b));
  console.log(`[copy] discovered ${buckets.length} buckets: ${buckets.join(", ")}`);

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
  console.log(
    `\n[copy summary] copied=${summary.totalCopied} skipped=${summary.totalExists} errors=${summary.totalErrors}`,
  );
}

// ─── Phase 2: rewrite DB URLs ─────────────────────────────────────────────

if (!skipRewrite) {
  console.log(`\n[rewrite] discovering columns containing storage URLs…`);

  // Discover every (table, column) in the public schema where any row
  // contains a Supabase Storage URL. We scan text/varchar columns in
  // BASE TABLES only (skipping views, which can't be UPDATE'd).
  const discoverSql = `
    DO $$
    DECLARE
      r record;
      cnt int;
    BEGIN
      CREATE TEMP TABLE IF NOT EXISTS _scan(t text, c text, n int) ON COMMIT DROP;
      TRUNCATE _scan;
      FOR r IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.data_type IN ('text', 'character varying', 'varchar')
          AND t.table_type = 'BASE TABLE'
      LOOP
        BEGIN
          EXECUTE format(
            'SELECT count(*) FROM public.%I WHERE %I LIKE %L',
            r.table_name, r.column_name, '%storage/v1/object/%'
          ) INTO cnt;
          IF cnt > 0 THEN
            INSERT INTO _scan VALUES (r.table_name, r.column_name, cnt);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END LOOP;
    END $$;
    SELECT t, c, n FROM _scan ORDER BY n DESC;
  `;

  const targets = await mgmtSql(discoverSql);
  console.log(
    `[rewrite] discovered ${targets.length} columns with storage URLs ` +
      `(${targets.reduce((s, r) => s + r.n, 0)} rows total)`,
  );
  for (const r of targets) console.log(`  - ${r.t}.${r.c}  (${r.n} rows)`);

  const oldPrefix = `${SUPABASE_URL}/storage/v1/object/public/`;
  const newPrefix = `${R2_PUBLIC}/`;

  console.log(`\n[rewrite] mapping`);
  console.log(`  FROM: ${oldPrefix}`);
  console.log(`  TO:   ${newPrefix}`);
  if (dryRun) console.log("  (dry-run: no UPDATEs will run)");

  for (const { t: table, c: col } of targets) {
    try {
      // We use REPLACE() to swap the prefix in place so any sub-path is
      // preserved (including bucket name + user id + filename).
      const sql = dryRun
        ? `SELECT count(*)::int AS n FROM public."${table}" WHERE "${col}" LIKE '${oldPrefix.replace(/'/g, "''")}%'`
        : `UPDATE public."${table}" SET "${col}" = REPLACE("${col}", '${oldPrefix.replace(/'/g, "''")}', '${newPrefix.replace(/'/g, "''")}') WHERE "${col}" LIKE '${oldPrefix.replace(/'/g, "''")}%'`;
      const r = await mgmtSql(sql);
      if (dryRun) {
        console.log(`  [dry] ${table}.${col}: would rewrite ${r[0]?.n ?? 0} rows`);
      } else {
        // Management API doesn't return rowCount for UPDATE; do a verify count.
        const verify = await mgmtSql(
          `SELECT count(*)::int AS n FROM public."${table}" WHERE "${col}" LIKE '${oldPrefix.replace(/'/g, "''")}%'`,
        );
        const remaining = verify[0]?.n ?? 0;
        console.log(`  ${table}.${col}: rewritten (${remaining} rows still on old URL)`);
      }
      await sleep(400); // be kind to the rate limiter
    } catch (e) {
      console.error(`  ${table}.${col}: ${e.message}`);
    }
  }
}

console.log("\nDONE");
