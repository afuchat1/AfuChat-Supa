import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;

// ─── Suppress expected Supabase refresh-token errors ────────────────────────
// When the app starts with a stale/revoked refresh token in storage, Supabase
// calls console.error with an AuthApiError before firing SIGNED_OUT via
// onAuthStateChange.  AuthContext already handles the SIGNED_OUT event
// gracefully (it restores the session from SecureStore without touching React
// state), so this console.error is purely noise.  We intercept and drop it
// here — at the earliest possible point before Expo Router's log middleware
// picks it up — rather than letting it appear as a red error to developers or
// get swallowed by crash reporters as a false positive.
//
// The filter is intentionally narrow: it only matches objects tagged with
// Supabase's own __isAuthError flag AND the specific refresh_token_not_found
// code.  All other errors are passed through unchanged.
if (typeof console !== "undefined" && typeof console.error === "function") {
  const _originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      first !== null &&
      first !== undefined &&
      typeof first === "object" &&
      (first as Record<string, unknown>).__isAuthError === true &&
      (
        (first as Record<string, unknown>).code === "refresh_token_not_found" ||
        String((first as Record<string, unknown>).message ?? "").toLowerCase().includes("refresh token not found")
      )
    ) {
      return;
    }
    // Also filter the string form that some Supabase versions log
    if (typeof first === "string" && first.toLowerCase().includes("refresh token not found")) {
      return;
    }
    _originalConsoleError(...args);
  };
}

const isWeb = Platform.OS === "web";
const isStaticRender = isWeb && typeof window === "undefined";

// Expo Router's static export evaluates the app in Node to generate HTML.
// Supabase Realtime only needs a WebSocket when a browser/native client
// subscribes, but its constructor still requires a WebSocket implementation
// during server evaluation. Keep static rendering offline while preserving the
// real browser/native transport.
class StaticRenderWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly readyState = StaticRenderWebSocket.CLOSED;
  onopen: (() => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(_url: string | URL, _protocols?: string | string[]) {}

  addEventListener(_type: string, _listener: (...args: unknown[]) => void) {}
  removeEventListener(_type: string, _listener: (...args: unknown[]) => void) {}
  send(_data: string) {}
  close() {}
}

const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort();
  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
};

// AsyncStorage is the correct durable store for native builds. On web, use the
// browser's localStorage directly so Supabase can persist the PKCE verifier and
// restore the session after the OAuth provider redirects back to the site.
const webStorage = {
  getItem: async (key: string) =>
    typeof window !== "undefined" ? window.localStorage.getItem(key) : null,
  setItem: async (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isWeb ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb,
    flowType: "pkce",
  },
  global: {
    fetch: fetchWithTimeout,
  },
  realtime: {
    heartbeatIntervalMs: 15_000,
    reconnectAfterMs: (tries: number) => Math.min(500 * tries, 5_000),
    ...(isStaticRender ? { transport: StaticRenderWebSocket } : {}),
  },
});
