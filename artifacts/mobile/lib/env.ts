/**
 * env.ts — single source of truth for all public runtime constants.
 *
 * Public runtime values may be read from environment variables. The Supabase
 * anon key is intentionally bundled because it is a public client key protected
 * by Supabase RLS; private service-role credentials must never be added here.
 *
 * Rules:
 *  - Never add secrets here (no service-role keys, private tokens, or provider keys).
 *  - Supabase URL + anon key are intentionally public (Supabase RLS guards data).
 *  - Import from this file; never call process.env.EXPO_PUBLIC_* elsewhere.
 */

export const SUPABASE_URL: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim() ||
  "https://poijhidfekwfthyksatp.supabase.co";

export const SUPABASE_ANON_KEY: string = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvaWpoaWRmZWt3ZnRoeWtzYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDcwNDksImV4cCI6MjEwNTQ4MzA0OX0.sEcHL19jvnPkFDUmYRazp5ntwFyJd_mE4Nh--lbaVNE";

export const APP_DOMAIN: string =
  (process.env.EXPO_PUBLIC_DOMAIN ?? "").trim() || "afuchat.com";

export const APP_ORIGIN: string = `https://${APP_DOMAIN}`;

/** Canonical Afu product API gateway; product paths remain explicitly namespaced. */
const API_GATEWAY_ORIGIN = "https://api.afuchat.com";

/** AfuChat and AfuAuth client requests must use the canonical API gateway. */
export const AFUCHAT_API_URL: string = API_GATEWAY_ORIGIN;

/** AfuAI owns AI requests under /v1/ai; provider credentials remain server-side. */
export const AFUAI_API_URL: string =
  new URL(
    (process.env.EXPO_PUBLIC_AFUAI_API_URL ?? "").trim() || API_GATEWAY_ORIGIN,
    API_GATEWAY_ORIGIN,
  ).origin;

export const AFUCHAT_MEDIA_CDN_URL: string =
  (process.env.EXPO_PUBLIC_AFUCHAT_MEDIA_CDN_URL ?? "").trim() ||
  "https://cdn.afuchat.com/chat";

// Google OAuth web client ID. This is public configuration and is also used
// by the native Google credential flow as its server/web audience.
export const GOOGLE_WEB_CLIENT_ID: string =
  (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "").trim() ||
  "148950951890-hejlh2vvpeb7tg7d8haj6om52pf86ig6.apps.googleusercontent.com";

/**
 * Giphy public API key — used client-side for GIF search and trending.
 * Intentionally public: Giphy keys are designed to be embedded in client apps
 * (same security model as the Supabase anon key — rate-limiting is API-side).
 */
export const GIPHY_API_KEY: string =
  (process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? "").trim();
