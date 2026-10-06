export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_ACCOUNTS_SCHEMA?: string;
  AFUCHAT_SUPABASE_URL?: string;
  AFUCHAT_SUPABASE_ANON_KEY?: string;
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

interface SupabaseAuthData {
  user?: AuthUser;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
}

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function json(request: Request, body: unknown, status = 200): Response {
  const headers = new Headers({
    ...jsonHeaders,
    "Cache-Control": "private, no-store",
    "X-AfuAuth-Worker": "afuauth-api",
    Vary: "Origin, Authorization",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, X-Client-Info",
    "Access-Control-Max-Age": "86400",
  });
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (
        host === "afuchat.com" ||
        host.endsWith(".afuchat.com") ||
        host.endsWith(".replit.dev") ||
        host.endsWith(".replit.app") ||
        host.endsWith(".vercel.app")
      ) {
        headers.set("Access-Control-Allow-Origin", origin);
      }
    } catch {
      // Invalid origins are never reflected.
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function supabaseAuthConfig(env: Env): { base: string; anonKey: string } {
  const base = (env.AFUCHAT_SUPABASE_URL || env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anonKey = env.AFUCHAT_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!base || !anonKey) throw new Error("Shared authentication provider is not configured");
  return { base, anonKey };
}

function accountsSchema(env: Env): string {
  return env.SUPABASE_ACCOUNTS_SCHEMA?.trim() || "accounts";
}

function serviceKey(env: Env): string {
  const key = env.SUPABASE_SERVICE_KEY?.trim();
  if (!key) throw new Error("Shared account data service is not configured");
  return key;
}

async function dbRows(
  env: Env,
  schema: string,
  path: string,
  method = "GET",
  body?: unknown,
  prefer?: string,
): Promise<any[]> {
  const key = serviceKey(env);
  const headers = new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": schema,
    "Content-Profile": schema,
    "Content-Type": "application/json",
  });
  if (prefer) headers.set("Prefer", prefer);
  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}`,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`Shared account request failed (${response.status})`);
  if (!text) return [];
  const value: unknown = JSON.parse(text);
  return Array.isArray(value) ? value : [value];
}

async function requestSupabaseAuth(
  env: Env,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string;
  } = {},
): Promise<{ response: Response; data: SupabaseAuthData | null }> {
  const { base, anonKey } = supabaseAuthConfig(env);
  const headers = new Headers({ apikey: anonKey });
  headers.set("Authorization", `Bearer ${options.accessToken || anonKey}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}/auth/v1${path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => null) as SupabaseAuthData | null;
  return { response, data };
}

async function getSupabaseUser(env: Env, accessToken: string): Promise<AuthUser | null> {
  const { response, data } = await requestSupabaseAuth(env, "/user", {
    method: "GET",
    accessToken,
  });
  return response.ok && data?.id ? data as AuthUser : null;
}

async function getUserByEmail(env: Env, email: string): Promise<Profile | null> {
  const rows = await dbRows(
    env,
    accountsSchema(env),
    `profiles?email=ilike.${encodeURIComponent(email)}&limit=1`,
  );
  return rows[0] ?? null;
}

async function getUserById(env: Env, id: string): Promise<Profile | null> {
  const rows = await dbRows(
    env,
    accountsSchema(env),
    `profiles?user_id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows[0] ?? null;
}

async function ensureAccountProfile(env: Env, authUser: AuthUser): Promise<Profile> {
  const existing = await getUserById(env, authUser.id);
  if (existing) return existing;

  const email = authUser.email?.trim().toLowerCase();
  if (!email) throw new Error("Supabase Auth user has no email address");
  const metadata = authUser.user_metadata ?? {};
  const nameValue = metadata.name ?? metadata.full_name ?? metadata.display_name;
  const name = typeof nameValue === "string" && nameValue.trim()
    ? nameValue.trim()
    : email.split("@")[0];

  try {
    const rows = await dbRows(
      env,
      accountsSchema(env),
      "profiles",
      "POST",
      {
        user_id: authUser.id,
        email,
        name,
        email_verified: Boolean(authUser.email_confirmed_at),
      },
      "return=representation",
    );
    if (rows[0]) return rows[0];
  } catch (error) {
    // The auth.users trigger may have inserted the shared profile concurrently.
    const racedProfile = await getUserById(env, authUser.id).catch(() => null);
    if (racedProfile) return racedProfile;
    throw error;
  }

  const profile = await getUserById(env, authUser.id);
  if (!profile) throw new Error("Could not create shared account profile");
  return profile;
}

function userPayload(user: Profile) {
  return {
    id: user.user_id,
    email: user.email,
    name: user.name,
    avatar: user.avatar ?? null,
    emailVerified: Boolean(user.email_verified),
    createdAt: user.created_at ?? null,
  };
}

function authUserPayload(user: AuthUser) {
  const email = user.email ?? "";
  const metadata = user.user_metadata ?? {};
  const metadataName = metadata.name ?? metadata.full_name ?? metadata.display_name;
  return {
    id: user.id,
    email,
    name: typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : email.split("@")[0],
    avatar: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
    emailVerified: Boolean(user.email_confirmed_at),
  };
}

function sessionPayload(data: SupabaseAuthData, profile?: Profile) {
  if (!data.user) throw new Error("Shared authentication provider returned no user");
  return {
    user: profile ? userPayload(profile) : authUserPayload(data.user),
    accessToken: data.access_token ?? null,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_at ?? null,
    tokenType: data.token_type ?? "bearer",
  };
}

async function resolveIdentifier(env: Env, identifier: string): Promise<string | null> {
  if (identifier.includes("@")) return identifier.toLowerCase();
  for (const field of ["handle", "phone"]) {
    try {
      const rows = await dbRows(
        env,
        "public",
        `profiles?select=email&${field}=eq.${encodeURIComponent(identifier)}&limit=1`,
      );
      if (typeof rows[0]?.email === "string") return rows[0].email;
    } catch {
      // Some older profile schemas do not expose every lookup column.
    }
  }
  return null;
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  return match?.[1] ?? "";
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  const prefix = "/v1/auth";
  const isLegacyResolver = path === "/v1/auth-resolve-identifier";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: json(request, {}).headers });
  }
  if (path === "/") {
    return json(request, {
      name: "AfuAuth API",
      status: "ok",
      worker: "afuauth-api",
      version: "v1",
      health: "/v1/auth/healthz",
    });
  }
  if (path === "/healthz" || path === `${prefix}/healthz`) {
    return json(request, { status: "ok", worker: "afuauth-api", version: "v1" });
  }

  if (isLegacyResolver || path === `${prefix}/resolve-identifier`) {
    if (request.method !== "POST") {
      return json(request, { error: "Method not allowed" }, 405);
    }
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

  if (path === `${prefix}/forgot-password`) {
    if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
    const body = await readJson(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return json(request, { error: "email is required" }, 400);
    try {
      const result = await requestSupabaseAuth(
        env,
        `/recover?redirect_to=${encodeURIComponent("https://afuchat.com/")}`,
        { body: { email } },
      );
      if (!result.response.ok) {
        return json(request, { error: "Password recovery is temporarily unavailable" }, 503);
      }
      return json(request, { message: "If that email exists, a reset link has been sent." });
    } catch (error) {
      console.error("[afuauth-forgot-password]", error);
      return json(request, { error: "Password recovery is temporarily unavailable" }, 503);
    }
  }

  if (path === `${prefix}/reset-password`) {
    if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
    const body = await readJson(request);
    const newPassword = body.newPassword;
    const token = bearerToken(request);
    if (!token) return json(request, { error: "A Supabase recovery session is required" }, 401);
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return json(request, { error: "Password must be at least 8 characters" }, 400);
    }
    try {
      const authUser = await getSupabaseUser(env, token);
      if (!authUser) return json(request, { error: "Invalid or expired Supabase session" }, 401);
      const result = await requestSupabaseAuth(env, "/user", {
        method: "PUT",
        accessToken: token,
        body: { password: newPassword },
      });
      if (!result.response.ok) {
        return json(request, { error: "Password reset could not be completed" }, 400);
      }
      return json(request, { message: "Password reset successfully." });
    } catch (error) {
      console.error("[afuauth-reset-password]", error);
      return json(request, { error: "Password reset is temporarily unavailable" }, 503);
    }
  }

  if (!path.startsWith(`${prefix}/`)) {
    return json(request, { error: "Not found", path }, 404);
  }

  const allowedMethod =
    (path === `${prefix}/register` && request.method === "POST") ||
    (path === `${prefix}/login` && request.method === "POST") ||
    (path === `${prefix}/session` && request.method === "POST") ||
    (path === `${prefix}/refresh` && request.method === "POST") ||
    (path === `${prefix}/logout` && request.method === "POST") ||
    (path === `${prefix}/me` && request.method === "GET") ||
    (path === `${prefix}/me/update` && request.method === "PATCH") ||
    (path === `${prefix}/me/password` && request.method === "PATCH");
  if (!allowedMethod) return json(request, { error: "Method not allowed" }, 405);

  try {
    if (path === `${prefix}/register`) {
      const body = await readJson(request);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = body.password;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!email || typeof password !== "string" || !name) {
        return json(request, { error: "email, password, and name are required" }, 400);
      }
      if (await getUserByEmail(env, email)) {
        return json(request, { error: "Email already registered" }, 409);
      }
      const result = await requestSupabaseAuth(env, "/signup", {
        body: { email, password, data: { name } },
      });
      if (!result.response.ok || !result.data?.user) {
        return json(request, { error: "Unable to create account" }, 400);
      }
      const profile = await ensureAccountProfile(env, result.data.user);
      return json(request, {
        ...sessionPayload(result.data, profile),
        requiresEmailConfirmation: !result.data.access_token,
      }, 201);
    }

    if (path === `${prefix}/login`) {
      const body = await readJson(request);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = body.password;
      if (!email || typeof password !== "string" || !password) {
        return json(request, { error: "email and password are required" }, 400);
      }
      const result = await requestSupabaseAuth(env, "/token?grant_type=password", {
        body: { email, password },
      });
      if (!result.response.ok || !result.data?.user || !result.data.access_token) {
        return json(request, { error: "Invalid credentials" }, 401);
      }
      const profile = await ensureAccountProfile(env, result.data.user);
      return json(request, sessionPayload(result.data, profile));
    }

    if (path === `${prefix}/session`) {
      const token = bearerToken(request);
      if (!token) return json(request, { error: "Supabase bearer token is required" }, 401);
      const authUser = await getSupabaseUser(env, token);
      if (!authUser) return json(request, { error: "Invalid or expired Supabase session" }, 401);
      // Return the verified Supabase identity. Never mint a product-specific JWT.
      return json(request, { user: authUserPayload(authUser), accessToken: token });
    }

    if (path === `${prefix}/refresh`) {
      const body = await readJson(request);
      const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
      if (!refreshToken) return json(request, { error: "refreshToken is required" }, 400);
      const result = await requestSupabaseAuth(env, "/token?grant_type=refresh_token", {
        body: { refresh_token: refreshToken },
      });
      if (!result.response.ok || !result.data?.user || !result.data.access_token) {
        return json(request, { error: "Invalid or expired Supabase refresh token" }, 401);
      }
      const profile = await ensureAccountProfile(env, result.data.user);
      return json(request, sessionPayload(result.data, profile));
    }

    const token = bearerToken(request);
    if (!token) return json(request, { error: "Supabase bearer token is required" }, 401);
    const authUser = await getSupabaseUser(env, token);
    if (!authUser) return json(request, { error: "Invalid or expired Supabase session" }, 401);

    if (path === `${prefix}/logout`) {
      const result = await requestSupabaseAuth(env, "/logout", {
        accessToken: token,
      });
      if (!result.response.ok) return json(request, { error: "Unable to sign out" }, 401);
      return json(request, { message: "Logged out" });
    }

    if (path === `${prefix}/me`) {
      const profile = await getUserById(env, authUser.id);
      return profile
        ? json(request, userPayload(profile))
        : json(request, { error: "User not found" }, 404);
    }

    if (path === `${prefix}/me/update`) {
      const body = await readJson(request);
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim()) {
          return json(request, { error: "Name cannot be empty" }, 400);
        }
        updates.name = body.name.trim();
      }
      if (body.avatar !== undefined) {
        if (body.avatar !== null && typeof body.avatar !== "string") {
          return json(request, { error: "Avatar must be a URL or null" }, 400);
        }
        updates.avatar = body.avatar;
      }
      if (Object.keys(updates).length === 0) {
        const profile = await getUserById(env, authUser.id);
        return profile
          ? json(request, userPayload(profile))
          : json(request, { error: "User not found" }, 404);
      }
      const rows = await dbRows(
        env,
        accountsSchema(env),
        `profiles?user_id=eq.${encodeURIComponent(authUser.id)}`,
        "PATCH",
        updates,
        "return=representation",
      );
      return rows[0]
        ? json(request, userPayload(rows[0]))
        : json(request, { error: "User not found" }, 404);
    }

    if (path === `${prefix}/me/password`) {
      const body = await readJson(request);
      const currentPassword = body.currentPassword;
      const newPassword = body.newPassword;
      if (typeof currentPassword !== "string" || !currentPassword ||
          typeof newPassword !== "string" || !newPassword) {
        return json(request, { error: "currentPassword and newPassword are required" }, 400);
      }
      if (newPassword.length < 8) {
        return json(request, { error: "Password must be at least 8 characters" }, 400);
      }
      if (!authUser.email) {
        return json(request, { error: "Password changes are unavailable for this account" }, 400);
      }
      const currentSession = await requestSupabaseAuth(env, "/token?grant_type=password", {
        body: { email: authUser.email, password: currentPassword },
      });
      if (!currentSession.response.ok) {
        return json(request, { error: "Current password is incorrect" }, 401);
      }
      const changed = await requestSupabaseAuth(env, "/user", {
        method: "PUT",
        accessToken: token,
        body: { password: newPassword },
      });
      if (!changed.response.ok) {
        return json(request, { error: "Password could not be changed" }, 400);
      }
      return json(request, { message: "Password changed successfully" });
    }

    return json(request, { error: "Not found", path }, 404);
  } catch (error) {
    console.error("[afuauth-api]", error);
    return json(request, { error: "Authentication service is unavailable" }, 503);
  }
}

export default { fetch: handleRequest };
