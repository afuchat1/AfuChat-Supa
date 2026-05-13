// ─── TURN / STUN Server Configuration ─────────────────────────────────────────
// Loads TURN credentials from Supabase app_settings at runtime.
// Falls back to public STUN + OpenRelay TURN if no custom TURN is configured.
// Credentials are cached for 60 minutes to avoid re-fetching on every call.

import { supabase } from "../supabase";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// ── Static fallback ICE servers ────────────────────────────────────────────────
// Used when Supabase app_settings has no custom TURN configured.
// OpenRelay is a free public TURN relay suitable for development/low-traffic.
const FALLBACK_ICE_SERVERS: IceServerConfig[] = [
  // Google STUN — worldwide, no auth required
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  // Cloudflare STUN
  { urls: "stun:stun.cloudflare.com:3478" },
  // OpenRelay free TURN (no SLA — for fallback only)
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

interface CacheEntry {
  servers: IceServerConfig[];
  expiresAt: number;
}

let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Returns the ICE server list to pass to RTCPeerConnection.
 * Tries to load custom TURN credentials from Supabase `app_settings`.
 * Falls back to public servers on any error.
 */
export async function getIceServers(): Promise<IceServerConfig[]> {
  const now = Date.now();
  if (_cache && _cache.expiresAt > now) return _cache.servers;

  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "turn_servers")
      .maybeSingle();

    if (data?.value) {
      const custom = parseCustomTurn(data.value);
      if (custom.length > 0) {
        // Merge custom TURN with Google/Cloudflare STUN (always include STUN)
        const servers: IceServerConfig[] = [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          ...custom,
        ];
        _cache = { servers, expiresAt: now + CACHE_TTL_MS };
        return servers;
      }
    }
  } catch {
    // Network error or table not present — use fallback
  }

  _cache = { servers: FALLBACK_ICE_SERVERS, expiresAt: now + CACHE_TTL_MS };
  return FALLBACK_ICE_SERVERS;
}

/**
 * Force-expire the cache. Call this if TURN credentials are rotated.
 */
export function invalidateTurnCache() {
  _cache = null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse the `turn_servers` value from app_settings.
 * Expected shape (JSON):
 *   [{ "urls": ["turn:my.host:3478"], "username": "user", "credential": "pass" }]
 * or a single object:
 *   { "urls": "turn:my.host:3478", "username": "user", "credential": "pass" }
 */
function parseCustomTurn(raw: any): IceServerConfig[] {
  try {
    const val = typeof raw === "string" ? JSON.parse(raw) : raw;
    const list: any[] = Array.isArray(val) ? val : [val];
    const out: IceServerConfig[] = [];
    for (const s of list) {
      if (!s?.urls) continue;
      const entry: IceServerConfig = { urls: s.urls };
      if (s.username) entry.username = s.username;
      if (s.credential) entry.credential = s.credential;
      out.push(entry);
    }
    return out;
  } catch {
    return [];
  }
}
