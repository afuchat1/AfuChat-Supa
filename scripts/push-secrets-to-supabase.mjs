#!/usr/bin/env node
/**
 * Push runtime configuration into Supabase's `public.app_settings` table.
 *
 * The table is the single source of truth for the API server at boot.
 * Only SUPABASE_SERVICE_ROLE_KEY needs to live in the deploy environment;
 * everything else is pulled from here at startup.
 *
 * Source of values: the *current* environment of whoever runs this script.
 * Run it once locally (or from any environment that already has the
 * secrets) to seed Supabase, then strip them from your deploy env.
 *
 * Required env (to authenticate this push):
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env (overrides the hard-coded URL):
 *   SUPABASE_URL                 default: hard-coded project URL
 *
 * Source env (any of these found in process.env will be pushed):
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *   R2_PUBLIC_BASE_URL
 *   R2_DEV_PUBLIC_URL
 *   R2_S3_ENDPOINT
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://rhnsjqqtdzlkvqazfcbg.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required.");
  process.exit(1);
}

const KEYS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "R2_DEV_PUBLIC_URL",
  "R2_S3_ENDPOINT",
];

const rows = KEYS.filter((k) => process.env[k] && process.env[k] !== "").map(
  (k) => ({ key: k, value: process.env[k] }),
);

if (!rows.length) {
  console.error("No source env vars set; nothing to push.");
  process.exit(1);
}

console.log(`Pushing ${rows.length} setting(s) to ${SUPABASE_URL}:`);
for (const r of rows) console.log(`  - ${r.key}`);

const r = await fetch(`${SUPABASE_URL}/rest/v1/app_settings`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});

if (!r.ok) {
  const text = await r.text();
  console.error(`Push failed: ${r.status} ${text}`);
  process.exit(1);
}

console.log("Push OK. Verifying readback…");
const v = await fetch(
  `${SUPABASE_URL}/rest/v1/app_settings?select=key,updated_at`,
  {
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
  },
);
const list = await v.json();
console.log(`app_settings now has ${list.length} row(s):`);
for (const row of list) console.log(`  - ${row.key}  (updated ${row.updated_at})`);
console.log("\nNext: remove the pushed keys from your Replit/deploy env.");
