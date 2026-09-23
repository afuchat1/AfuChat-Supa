import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { signInWithSupabase, signUpWithSupabase } from "../lib/supabase-auth";
import {
  signAccessToken,
  generateSecureToken, hashToken, refreshTokenExpiresAt,
  extractBearerToken,
} from "../lib/auth";
import { requireAuth } from "../middleware/auth";

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function getAuthName(email: string, metadata: unknown): string {
  const values = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const name = values.name ?? values.full_name ?? values.display_name;
  return typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0];
}

async function ensureAfuCloudProfile(
  db: ReturnType<typeof createDbClient>,
  authUser: { id: string; email?: string; user_metadata?: Record<string, unknown>; email_confirmed_at?: string | null },
) {
  const existing = await db.getUserById(authUser.id);
  if (existing) return existing;

  const email = authUser.email?.trim().toLowerCase();
  if (!email) throw new Error("Supabase Auth user has no email address");

  const profile = await db.createUser({
    user_id: authUser.id,
    email,
    name: getAuthName(email, authUser.user_metadata),
    email_verified: Boolean(authUser.email_confirmed_at),
  });
  return profile;
}

// POST /v1/auth/register
auth.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { password, name } = body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !password || !name) {
    return c.json({ error: "email, password, and name are required" }, 400);
  }
  const db = createDbClient(c.env);
  const existing = await db.getUserByEmail(email);
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const authUser = await signUpWithSupabase(c.env, email, password, name);
  if (!authUser) return c.json({ error: "Unable to create account" }, 400);
  const user = await ensureAfuCloudProfile(db, authUser);
  const accessToken = await signAccessToken({ userId: user.user_id, email: user.email }, c.env);
  const rawRefresh = generateSecureToken();
  await db.createRefreshToken({ user_id: user.user_id, token_hash: await hashToken(rawRefresh), expires_at: refreshTokenExpiresAt() });
  await db.logActivity({ user_id: user.user_id, action: "register", resource: "user", resource_id: user.user_id });

  return c.json({
    user: { id: user.user_id, email: user.email, name: user.name, avatar: user.avatar, emailVerified: user.email_verified, createdAt: user.created_at },
    accessToken,
    refreshToken: rawRefresh,
  }, 201);
});

// POST /v1/auth/login
auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { password } = body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !password) return c.json({ error: "email and password are required" }, 400);

  const db = createDbClient(c.env);
  const sharedAuthUser = await signInWithSupabase(c.env, email, password);
  if (!sharedAuthUser) return c.json({ error: "Invalid credentials" }, 401);
  const user = await ensureAfuCloudProfile(db, sharedAuthUser);

  const accessToken = await signAccessToken({ userId: user.user_id, email: user.email }, c.env);
  const rawRefresh = generateSecureToken();
  await db.createRefreshToken({ user_id: user.user_id, token_hash: await hashToken(rawRefresh), expires_at: refreshTokenExpiresAt() });
  await db.logActivity({ user_id: user.user_id, action: "login", resource: "user", resource_id: user.user_id });

  return c.json({
    user: { id: user.user_id, email: user.email, name: user.name, avatar: user.avatar, emailVerified: user.email_verified, createdAt: user.created_at },
    accessToken,
    refreshToken: rawRefresh,
  });
});

// POST /v1/auth/logout
auth.post("/logout", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  await db.deleteRefreshTokensByUserId(c.get("userId"));
  return c.json({ message: "Logged out" });
});

// POST /v1/auth/refresh
auth.post("/refresh", async (c) => {
  const { refreshToken } = await c.req.json().catch(() => ({}));
  if (!refreshToken) return c.json({ error: "refreshToken is required" }, 400);

  const db = createDbClient(c.env);
  const record = await db.getRefreshToken(await hashToken(refreshToken));
  if (!record || new Date(record.expires_at) < new Date()) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }
  const user = await db.getUserById(record.user_id);
  if (!user) return c.json({ error: "User not found" }, 401);

  const accessToken = await signAccessToken({ userId: user.user_id, email: user.email }, c.env);
  const newRaw = generateSecureToken();
  await db.deleteRefreshToken(record.id);
  await db.createRefreshToken({ user_id: user.user_id, token_hash: await hashToken(newRaw), expires_at: refreshTokenExpiresAt() });

  return c.json({
    user: { id: user.user_id, email: user.email, name: user.name, avatar: user.avatar, emailVerified: user.email_verified, createdAt: user.created_at },
    accessToken,
    refreshToken: newRaw,
  });
});

// GET /v1/auth/me
auth.get("/me", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const user = await db.getUserById(c.get("userId"));
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ id: user.user_id, email: user.email, name: user.name, avatar: user.avatar, emailVerified: user.email_verified, createdAt: user.created_at });
});

// PATCH /v1/auth/me/update
auth.patch("/me/update", requireAuth, async (c) => {
  const { name, avatar } = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (avatar !== undefined) updates.avatar = avatar;
  const db = createDbClient(c.env);
  const user = await db.updateUser(c.get("userId"), updates);
  return c.json({ id: user.user_id, email: user.email, name: user.name, avatar: user.avatar, emailVerified: user.email_verified, createdAt: user.created_at });
});

// PATCH /v1/auth/me/password
auth.patch("/me/password", requireAuth, async (c) => {
  const { currentPassword, newPassword } = await c.req.json().catch(() => ({}));
  if (!currentPassword || !newPassword) return c.json({ error: "currentPassword and newPassword are required" }, 400);
  if (newPassword.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
  const db = createDbClient(c.env);
  const user = await db.getUserById(c.get("userId"));
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ error: "Password changes must be completed through Supabase Auth." }, 501);
});

auth.post("/forgot-password", async (c) => c.json({ message: "If that email exists, a reset link has been sent." }));
auth.post("/reset-password", async (c) => c.json({ message: "Password reset successfully." }));

export default auth;
