/**
 * Server bootstrap: fetch runtime settings from Supabase before the
 * HTTP listener accepts requests.
 *
 * Behaviour:
 *   1. Reads every row from `public.app_settings` using the service-role
 *      key (which bypasses RLS).
 *   2. Writes each `key`/`value` into `process.env` *unless* the env var
 *      is already set — env-supplied values always win, so local dev can
 *      override Supabase-stored config without touching the table.
 *   3. If Supabase is unreachable (e.g. egress quota exceeded), logs a
 *      warning and continues with whatever is already in `process.env`.
 *
 * This is the only place outside `supabaseAdmin.ts` that talks directly
 * to Supabase using `fetch`. We avoid using the Supabase JS client here
 * to keep startup independent of any client-side caches.
 */

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./constants";
import { logger } from "./logger";

const KEYS_WE_CARE_ABOUT = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "R2_DEV_PUBLIC_URL",
  "R2_S3_ENDPOINT",
  "PESAPAL_CONSUMER_KEY",
  "PESAPAL_CONSUMER_SECRET",
  "PESAPAL_IPN_ID",
  "PESAPAL_ENV",
];

export interface BootstrapResult {
  loaded: number;
  skipped: number;
  source: "supabase" | "env-only";
  error?: string;
}

export async function loadAppSettings(): Promise<BootstrapResult> {
  const serviceKey = SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    logger.warn(
      "bootstrap: SUPABASE_SERVICE_ROLE_KEY missing — skipping Supabase settings load. " +
        "Server will use existing process.env values only.",
    );
    return { loaded: 0, skipped: 0, source: "env-only" };
  }

  let rows: Array<{ key: string; value: string }> = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?select=key,value`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          Accept: "application/json",
        },
      },
    );
    if (!r.ok) {
      const text = await r.text();
      logger.warn(
        { status: r.status, body: text.slice(0, 200) },
        "bootstrap: failed to load app_settings from Supabase, falling back to env",
      );
      return {
        loaded: 0,
        skipped: 0,
        source: "env-only",
        error: `${r.status}: ${text.slice(0, 120)}`,
      };
    }
    rows = await r.json();
  } catch (e: any) {
    logger.warn(
      { err: e?.message || String(e) },
      "bootstrap: Supabase fetch threw, falling back to env",
    );
    return {
      loaded: 0,
      skipped: 0,
      source: "env-only",
      error: e?.message || "fetch failed",
    };
  }

  let loaded = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row?.key || row.value == null) continue;
    if (process.env[row.key] !== undefined && process.env[row.key] !== "") {
      // Env wins over DB so local dev can override.
      skipped++;
      continue;
    }
    process.env[row.key] = String(row.value);
    loaded++;
  }

  // Surface what's known so we don't ship without R2 silently.
  const missing = KEYS_WE_CARE_ABOUT.filter(
    (k) => !process.env[k] || process.env[k] === "",
  );
  if (missing.length) {
    logger.warn({ missing }, "bootstrap: some expected settings still missing");
  }

  logger.info(
    { loaded, skipped, total: rows.length },
    "bootstrap: app_settings loaded from Supabase",
  );

  return { loaded, skipped, source: "supabase" };
}
