import type { Env } from "../types";

export interface SupabaseAuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
}

interface AuthResponse {
  user?: SupabaseAuthUser;
  access_token?: string;
  error?: string;
  error_description?: string;
}

async function authRequest(env: Env, path: string, body: Record<string, unknown>): Promise<AuthResponse | null> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null) as AuthResponse | null;
  return response.ok ? data : null;
}

export async function signInWithSupabase(
  env: Env,
  email: string,
  password: string,
): Promise<SupabaseAuthUser | null> {
  const response = await authRequest(env, "/token?grant_type=password", { email, password });
  return response?.user ?? null;
}

export async function signUpWithSupabase(
  env: Env,
  email: string,
  password: string,
  name: string,
): Promise<SupabaseAuthUser | null> {
  const response = await authRequest(env, "/signup", {
    email,
    password,
    data: { name },
  });
  return response?.user ?? null;
}

/**
 * Validate an AfuChat Supabase access token and return the corresponding
 * Supabase user. The token is never stored or re-issued here; this endpoint
 * only verifies the session through Supabase Auth before AfuCloud mints its
 * short-lived API token.
 */
export async function getUserWithSupabaseAccessToken(
  env: Env,
  accessToken: string,
): Promise<SupabaseAuthUser | null> {
  // AfuChat keeps product data and its active sessions in its own Supabase
  // project. AfuCloud owns the storage database, so validate the bearer token
  // against AfuChat and then mint an AfuCloud API token for the same user ID.
  const authUrl = env.AFUCHAT_SUPABASE_URL || env.SUPABASE_URL;
  const apiKey = env.AFUCHAT_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
  const response = await fetch(`${authUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json().catch(() => null) as SupabaseAuthUser | null;
  return response.ok && data?.id ? data : null;
}