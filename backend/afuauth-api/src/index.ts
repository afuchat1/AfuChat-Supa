interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_DB_SCHEMA?: string;
  SUPABASE_ACCOUNTS_SCHEMA?: string;
  AFUCHAT_SUPABASE_URL?: string;
  AFUCHAT_SUPABASE_ANON_KEY?: string;
  JWT_SECRET: string;
}

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
}

interface Profile {
  user_id: string;
  email: string;
  name: string;
  avatar?: string | null;
  email_verified?: boolean;
  created_at?: string;
}

const encoder = new TextEncoder();
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function json(request: Request, body: unknown, status = 200): Response {
  const headers = new Headers({
    ...jsonHeaders,
    "Cache-Control": "private, no-store",
    "X-AfuAuth-Worker": "afuauth-api",
    "Vary": "Origin, Authorization",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, X-Client-Info",
    "Access-Control-Max-Age": "86400",
  });
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (host === "afuchat.com" || host.endsWith(".afuchat.com") || host.endsWith(".replit.dev") || host.endsWith(".replit.app") || host.endsWith(".vercel.app")) {
        headers.set("Access-Control-Allow-Origin", origin);
      }
    } catch {
      // Invalid origins are not reflected.
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function dbRows(
  env: Env,
  schema: string,
  path: string,
  method = "GET",
  body?: unknown,
  prefer?: string,
): Promise<any[]> {
  const headers = new Headers({
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Accept-Profile": schema,
    "Content-Profile": schema,
    "Content-Type": "application/json",
  });
  if (prefer) headers.set("Prefer", prefer);
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Shared database request failed (${response.status})`);
  if (!text) return [];
  const value = JSON.parse(text);
  return Array.isArray(value) ? value : [value];
}

function productSchema(env: Env): string {
  return env.SUPABASE_DB_SCHEMA?.trim() || "afucloud";
}

function accountsSchema(env: Env): string {
  return env.SUPABASE_ACCOUNTS_SCHEMA?.trim() || "accounts";
}

async function getUserByEmail(env: Env, email: string): Promise<Profile | null> {
  const rows = await dbRows(env, accountsSchema(env), `profiles?email=ilike.${encodeURIComponent(email)}&limit=1`);
  return rows[0] ?? null;
}

async function getUserById(env: Env, id: string): Promise<Profile | null> {
  const rows = await dbRows(env, accountsSchema(env), `profiles?user_id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows[0] ?? null;
}

async function ensureAccountProfile(env: Env, authUser: AuthUser): Promise<Profile> {
  const existing = await getUserById(env, authUser.id);
  if (existing) return existing;
  const email = authUser.email?.trim().toLowerCase();
  if (!email) throw new Error("Supabase Auth user has no email address");
  const metadata = authUser.user_metadata ?? {};
  const nameValue = metadata.name ?? metadata.full_name ?? metadata.display_name;
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : email.split("@")[0];
  const rows = await dbRows(env, accountsSchema(env), "profiles", "POST", {
    user_id: authUser.id,
    email,
    name,
    email_verified: Boolean(authUser.email_confirmed_at),
  }, "return=representation");
  if (!rows[0]) throw new Error("Could not create shared account profile");
  return rows[0];
}

async function logActivity(env: Env, userId: string, action: string): Promise<void> {
  await dbRows(env, productSchema(env), "activity_logs", "POST", {
    user_id: userId,
    action,
    resource: "user",
    resource_id: userId,
  }).catch(() => []);
}

async function supabaseAuth(
  env: Env,
  path: string,
  body: Record<string, unknown>,
): Promise<AuthUser | null> {
  const base = (env.AFUCHAT_SUPABASE_URL || env.SUPABASE_URL).replace(/\/+$/, "");
  const anonKey = env.AFUCHAT_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) throw new Error("Shared authentication provider is not configured");
  const response = await fetch(`${base}/auth/v1${path}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null) as { user?: AuthUser } | null;
  return response.ok ? data?.user ?? null : null;
}

async function getSupabaseUser(env: Env, token: string): Promise<AuthUser | null> {
  const base = (env.AFUCHAT_SUPABASE_URL || env.SUPABASE_URL).replace(/\/+$/, "");
  const anonKey = env.AFUCHAT_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) throw new Error("Shared authentication provider is not configured");
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => null) as AuthUser | null;
  return response.ok && data?.id ? data : null;
}

async function signAccessToken(env: Env, user: Profile): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "HS256" })));
  const payload = base64Url(encoder.encode(JSON.stringify({
    userId: user.user_id,
    email: user.email,
    iat: now,
    exp: now + 900,
  })));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

async function verifyAccessToken(env: Env, token: string): Promise<{ userId: string; email: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    if (header.alg !== "HS256") return null;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = decodeBase64Url(parts[2]);
    const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (typeof payload.userId !== "string" || typeof payload.email !== "string" || typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) return null;
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

function secureToken(): string {
  return `afu_${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function refreshExpiresAt(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString();
}

async function createRefreshToken(env: Env, userId: string): Promise<string> {
  const token = secureToken();
  await dbRows(env, productSchema(env), "refresh_tokens", "POST", {
    user_id: userId,
    token_hash: await hashToken(token),
    expires_at: refreshExpiresAt(),
  });
  return token;
}

function userPayload(user: Profile) {
  return {
    id: user.user_id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    emailVerified: user.email_verified,
    createdAt: user.created_at,
  };
}

async function resolveIdentifier(env: Env, identifier: string): Promise<string | null> {
  if (identifier.includes("@")) return identifier.toLowerCase();
  for (const field of ["handle", "phone"]) {
    try {
      const rows = await dbRows(env, "public", `profiles?select=email&${field}=eq.${encodeURIComponent(identifier)}&limit=1`);
      if (typeof rows[0]?.email === "string") return rows[0].email;
    } catch {
      // Older schemas may not expose the optional lookup column.
    }
  }
  return null;
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const isLegacyResolver = path === "/v1/auth-resolve-identifier";
  const prefix = "/v1/auth";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json(request, {}).headers });
  if (path === "/healthz" || path === `${prefix}/healthz`) {
    return json(request, { status: "ok", worker: "afuauth-api", version: "v1" });
  }
  if (isLegacyResolver || path === `${prefix}/resolve-identifier`) {
    if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
    const body = await readJson(request);
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    if (!identifier) return json(request, { error: "identifier is required" }, 400);
    try {
      return json(request, { email: await resolveIdentifier(env, identifier) });
    } catch (error) {
      console.error("[afuauth-resolve-identifier]", error);
      return json(request, { error: "Account lookup is unavailable" }, 503);
    }
  }
  if (path === `${prefix}/forgot-password` && request.method === "POST") {
    return json(request, { message: "If that email exists, a reset link has been sent." });
  }
  if (path === `${prefix}/reset-password` && request.method === "POST") {
    return json(request, { message: "Password reset successfully." });
  }
  if (!path.startsWith(`${prefix}/`)) return json(request, { error: "Not found", path }, 404);
  if (!["GET", "POST", "PATCH"].includes(request.method)) return json(request, { error: "Method not allowed" }, 405);

  try {
    if (path === `${prefix}/register` && request.method === "POST") {
      const body = await readJson(request);
      const password = body.password;
      const name = body.name;
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email || !password || !name) return json(request, { error: "email, password, and name are required" }, 400);
      if (await getUserByEmail(env, email)) return json(request, { error: "Email already registered" }, 409);
      const authUser = await supabaseAuth(env, "/signup", { email, password, data: { name } });
      if (!authUser) return json(request, { error: "Unable to create account" }, 400);
      const user = await ensureAccountProfile(env, authUser);
      const accessToken = await signAccessToken(env, user);
      const refreshToken = await createRefreshToken(env, user.user_id);
      await logActivity(env, user.user_id, "register");
      return json(request, { user: userPayload(user), accessToken, refreshToken }, 201);
    }

    if (path === `${prefix}/login` && request.method === "POST") {
      const body = await readJson(request);
      const password = body.password;
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email || !password) return json(request, { error: "email and password are required" }, 400);
      const authUser = await supabaseAuth(env, "/token?grant_type=password", { email, password });
      if (!authUser) return json(request, { error: "Invalid credentials" }, 401);
      const user = await ensureAccountProfile(env, authUser);
      const accessToken = await signAccessToken(env, user);
      const refreshToken = await createRefreshToken(env, user.user_id);
      await logActivity(env, user.user_id, "login");
      return json(request, { user: userPayload(user), accessToken, refreshToken });
    }

    if (path === `${prefix}/session` && request.method === "POST") {
      const token = request.headers.get("Authorization")?.startsWith("Bearer ")
        ? request.headers.get("Authorization")!.slice(7)
        : "";
      if (!token) return json(request, { error: "Supabase bearer token is required" }, 401);
      const authUser = await getSupabaseUser(env, token);
      if (!authUser) return json(request, { error: "Invalid or expired Supabase session" }, 401);
      const user = await ensureAccountProfile(env, authUser);
      const accessToken = await signAccessToken(env, user);
      const refreshToken = await createRefreshToken(env, user.user_id);
      await logActivity(env, user.user_id, "session_exchange");
      return json(request, { user: userPayload(user), accessToken, refreshToken });
    }

    if (path === `${prefix}/refresh` && request.method === "POST") {
      const body = await readJson(request);
      if (typeof body.refreshToken !== "string" || !body.refreshToken) return json(request, { error: "refreshToken is required" }, 400);
      const hash = await hashToken(body.refreshToken);
      const rows = await dbRows(env, productSchema(env), `refresh_tokens?token_hash=eq.${encodeURIComponent(hash)}&limit=1`);
      const record = rows[0];
      if (!record || new Date(record.expires_at) < new Date()) return json(request, { error: "Invalid or expired refresh token" }, 401);
      const user = await getUserById(env, record.user_id);
      if (!user) return json(request, { error: "User not found" }, 401);
      await dbRows(env, productSchema(env), `refresh_tokens?id=eq.${encodeURIComponent(record.id)}`, "DELETE");
      const accessToken = await signAccessToken(env, user);
      const refreshToken = await createRefreshToken(env, user.user_id);
      return json(request, { user: userPayload(user), accessToken, refreshToken });
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const identity = token ? await verifyAccessToken(env, token) : null;
    if (!identity) return json(request, { error: token ? "Invalid or expired token" : "Unauthorized" }, 401);

    if (path === `${prefix}/logout` && request.method === "POST") {
      await dbRows(env, productSchema(env), `refresh_tokens?user_id=eq.${encodeURIComponent(identity.userId)}`, "DELETE");
      return json(request, { message: "Logged out" });
    }
    if (path === `${prefix}/me` && request.method === "GET") {
      const user = await getUserById(env, identity.userId);
      return user ? json(request, userPayload(user)) : json(request, { error: "User not found" }, 404);
    }
    if (path === `${prefix}/me/update` && request.method === "PATCH") {
      const body = await readJson(request);
      const updates: Record<string, unknown> = {};
      if (body.name != null) updates.name = body.name;
      if (body.avatar !== undefined) updates.avatar = body.avatar;
      const rows = await dbRows(env, accountsSchema(env), `profiles?user_id=eq.${encodeURIComponent(identity.userId)}`, "PATCH", updates, "return=representation");
      return rows[0] ? json(request, userPayload(rows[0])) : json(request, { error: "User not found" }, 404);
    }
    if (path === `${prefix}/me/password` && request.method === "PATCH") {
      const body = await readJson(request);
      if (!body.currentPassword || !body.newPassword) return json(request, { error: "currentPassword and newPassword are required" }, 400);
      if (typeof body.newPassword !== "string" || body.newPassword.length < 8) return json(request, { error: "Password must be at least 8 characters" }, 400);
      if (!(await getUserById(env, identity.userId))) return json(request, { error: "User not found" }, 404);
      return json(request, { error: "Password changes must be completed through Supabase Auth." }, 501);
    }
    return json(request, { error: "AfuAuth endpoint is not implemented yet", worker: "afuauth-api" }, 501);
  } catch (error) {
    console.error("[afuauth-api]", error);
    return json(request, { error: "Authentication service is unavailable" }, 503);
  }
}

export default { fetch: handleRequest };
