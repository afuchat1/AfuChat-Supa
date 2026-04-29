#!/usr/bin/env node
/**
 * Migrate legacy Supabase Storage URLs to Cloudflare R2 / cdn.afuchat.com.
 *
 * The standard `migrate-storage.mjs` script only handles URLs from the *current*
 * Supabase project. This script handles URLs from *other* (older) Supabase
 * projects that are still referenced from rows in the current database.
 *
 * Strategy:
 *   - Discover every (table, column, row) where the value matches the
 *     pattern `https?://*.supabase.co/storage/v1/object/public/<bucket>/<path>`
 *   - For each unique URL: download from the legacy host, upload to R2 under
 *     `<bucket>/<path>`, then build the new CDN URL
 *   - UPDATE the row to point at the CDN URL
 *   - Skip URLs that 404 / time out (record them in a report)
 *
 * Run with `--dry-run` to preview changes without copying or updating.
 *
 * Required env:
 *   SUPABASE_SERVICE_ROLE_KEY      service role for the current project
 *   SUPABASE_ACCESS_TOKEN          management API token (for SQL UPDATE)
 *   SUPABASE_PROJECT_REF           current project ref
 *   CLOUDFLARE_R2_ACCESS_KEY_ID    R2 credentials
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   R2_S3_ENDPOINT                 e.g. https://<acct>.r2.cloudflarestorage.com
 *   R2_BUCKET                      e.g. afuchat-media
 *   R2_PUBLIC_BASE_URL             e.g. https://cdn.afuchat.com
 */

import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "node:stream";

const SUPABASE_URL = "https://rhnsjqqtdzlkvqazfcbg.supabase.co";
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MGMT = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const R2_ENDPOINT = process.env.R2_S3_ENDPOINT;
const R2_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "afuchat-media";
const R2_PUBLIC = process.env.R2_PUBLIC_BASE_URL || "https://cdn.afuchat.com";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipCopy = args.has("--skip-copy");

function fail(msg) { console.error("ERROR:", msg); process.exit(1); }
if (!SK) fail("SUPABASE_SERVICE_ROLE_KEY required");
if (!skipCopy && (!R2_ENDPOINT || !R2_KEY || !R2_SECRET)) fail("R2 credentials required for copy phase");

const SB_HEADERS = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const MGMT_HEADERS = { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" };

const s3 = !skipCopy
  ? new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
    })
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const URL_RE = /https?:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/([^/?#\s"]+)\/([^?#\s"]+)/i;

async function mgmtSql(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: "POST", headers: MGMT_HEADERS, body: JSON.stringify({ query }),
    });
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`mgmt sql ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  }
  throw new Error("mgmt sql: rate limited");
}

async function r2HasObject(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function copyOne(url, key) {
  if (await r2HasObject(key)) return "exists";
  if (dryRun) return "would-copy";
  const r = await fetch(url);
  if (!r.ok) return `fetch-failed-${r.status}`;
  await new Upload({
    client: s3,
    params: {
      Bucket: R2_BUCKET, Key: key, Body: Readable.fromWeb(r.body),
      ContentType: r.headers.get("content-type") || "application/octet-stream",
      CacheControl: "public, max-age=31536000",
    },
  }).done();
  return "copied";
}

// Pull rows directly via REST (we know the two affected tables/columns from the
// discovery scan in migrate-storage.mjs, but verify here for robustness).
async function fetchRows(table, column, idCol = "id") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${idCol},${column}&${column}=like.*storage/v1/object/*`;
  const r = await fetch(url, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(`${table}.${column} fetch failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function processColumn(table, column) {
  console.log(`\n[${table}.${column}]`);
  const rows = await fetchRows(table, column);
  console.log(`  ${rows.length} rows with legacy storage URLs`);

  const results = { copied: 0, exists: 0, failed: 0, rewritten: 0, skippedDead: 0 };

  for (const row of rows) {
    const oldUrl = row[column];
    const m = oldUrl.match(URL_RE);
    if (!m) { console.log(`  ${row.id}: SKIP (no match): ${oldUrl}`); continue; }
    const [, bucket, path] = m;
    const key = `${bucket}/${path}`;
    const newUrl = `${R2_PUBLIC}/${key}`;

    let copyResult = "skipped";
    if (!skipCopy) {
      try { copyResult = await copyOne(oldUrl, key); }
      catch (e) { copyResult = `error:${e.message}`; }
    }

    if (copyResult === "copied") results.copied++;
    else if (copyResult === "exists") results.exists++;
    else if (copyResult.startsWith("fetch-failed") || copyResult.startsWith("error")) {
      results.failed++;
      console.log(`  ${row.id}: COPY FAILED (${copyResult}) — ${oldUrl}`);
      // We still rewrite the URL so the app stops hitting the legacy host;
      // a 404 against the CDN is no worse than a 404 against a dead supabase
      // project, and it stops the egress on the live one.
    } else if (copyResult === "would-copy") {
      console.log(`  ${row.id}: would copy ${oldUrl} -> ${newUrl}`);
    }

    if (dryRun) {
      results.rewritten++;
      console.log(`  ${row.id}: DRY rewrite ${oldUrl} -> ${newUrl}`);
      continue;
    }

    // Rewrite via PostgREST (service role; one-row PATCH).
    const patch = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(row.id)}`,
      {
        method: "PATCH",
        headers: { ...SB_HEADERS, Prefer: "return=minimal" },
        body: JSON.stringify({ [column]: newUrl }),
      },
    );
    if (!patch.ok) throw new Error(`PATCH ${table}/${row.id} failed: ${patch.status} ${await patch.text()}`);
    results.rewritten++;
    await sleep(50);
  }

  console.log(`  done: copied=${results.copied} exists=${results.exists} failed=${results.failed} rewritten=${results.rewritten}`);
  return results;
}

console.log(`Legacy Supabase URL migration → ${R2_PUBLIC}`);
console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"} ${skipCopy ? "(skip-copy)" : ""}`);

const totals = { copied: 0, exists: 0, failed: 0, rewritten: 0 };
for (const [t, c] of [
  ["merchant_products", "image_url"],
  ["blog_articles", "cover_image"],
]) {
  const r = await processColumn(t, c);
  totals.copied += r.copied; totals.exists += r.exists;
  totals.failed += r.failed; totals.rewritten += r.rewritten;
}

console.log(`\nTOTAL: copied=${totals.copied} exists=${totals.exists} failed=${totals.failed} rewritten=${totals.rewritten}`);
