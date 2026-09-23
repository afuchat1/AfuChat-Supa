import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { authUsersTable, db, profilesTable, refreshTokensTable } from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateSecureToken,
  hashToken,
  refreshTokenExpiresAt,
} from "../lib/auth";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router: IRouter = Router();

type AuthMetadata = Record<string, unknown>;

function getAuthName(email: string, metadata: unknown): string {
  const values = metadata && typeof metadata === "object" ? metadata as AuthMetadata : {};
  const name = values.name ?? values.full_name ?? values.display_name;
  return typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0];
}

function authUnavailable(res: Parameters<Parameters<typeof router.post>[1]>[1], operation: string, error: unknown): void {
  const cause = error instanceof Error && "cause" in error
    ? (error as Error & { cause?: unknown }).cause
    : undefined;
  logger.error({
    operation,
    code: cause && typeof cause === "object" && "code" in cause
      ? (cause as { code?: unknown }).code
      : undefined,
    message: error instanceof Error ? error.message : String(error),
  }, "Authentication dependency unavailable");
  res.status(503).json({ error: "Authentication service temporarily unavailable" });
}

async function ensureAfuCloudProfile(authUser: typeof authUsersTable.$inferSelect) {
  const [existing] = await db.select().from(profilesTable).where(eq(profilesTable.userId, authUser.id)).limit(1);
  if (existing) return existing;

  const email = authUser.email?.trim().toLowerCase();
  if (!email) throw new Error("Supabase Auth user has no email address");

  const [emailMatch] = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);
  if (emailMatch) {
    throw new Error("Supabase Auth email is already linked to a different AfuCloud user");
  }

  const [profile] = await db.insert(profilesTable).values({
    userId: authUser.id,
    email,
    name: getAuthName(email, authUser.rawUserMetaData),
  }).returning();
  return profile;
}

function toApiUser(
  authUser: typeof authUsersTable.$inferSelect,
  profile: typeof profilesTable.$inferSelect,
) {
  return {
    id: authUser.id,
    email: authUser.email ?? profile.email,
    name: profile.name ?? profile.fullName ?? authUser.email?.split("@")[0] ?? "User",
    avatar: profile.avatar ?? profile.avatarUrl,
    emailVerified: Boolean(authUser.emailConfirmedAt),
    createdAt: authUser.createdAt,
  };
}

async function findSharedAuthUser(email: string) {
  try {
    const [authUser] = await db
      .select()
      .from(authUsersTable)
      .where(sql`lower(${authUsersTable.email}) = ${email}`)
      .limit(1);
    return authUser;
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    console.error("Shared auth lookup failed", {
      code: cause && typeof cause === "object" && "code" in cause ? (cause as { code?: unknown }).code : undefined,
      message: cause instanceof Error ? cause.message : error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// POST /v1/auth/register
router.post("/v1/auth/register", async (req, res): Promise<void> => {
  const { password, name } = req.body ?? {};
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !password || !name) {
    res.status(400).json({ error: "email, password, and name are required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  const existing = await findSharedAuthUser(email);
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const encryptedPassword = await hashPassword(password);
  const now = new Date();
  const [authUser] = await db.insert(authUsersTable).values({
    id: crypto.randomUUID(),
    aud: "authenticated",
    role: "authenticated",
    email,
    encryptedPassword,
    rawAppMetaData: { provider: "email", providers: ["email"] },
    createdAt: now,
    updatedAt: now,
    rawUserMetaData: { name },
  }).returning();
  const user = await ensureAfuCloudProfile(authUser);
  const accessToken = signAccessToken({ userId: authUser.id, email: authUser.email ?? email });
  const rawRefresh = generateSecureToken();
  await db.insert(refreshTokensTable).values({
    userId: authUser.id,
    tokenHash: hashToken(rawRefresh),
    expiresAt: refreshTokenExpiresAt(),
  });
  res.status(201).json({
    user: toApiUser(authUser, user),
    accessToken,
    refreshToken: rawRefresh,
  });
});

// POST /v1/auth/login
router.post("/v1/auth/login", async (req, res): Promise<void> => {
  const { password } = req.body ?? {};
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  try {
    const sharedAuthUser = await findSharedAuthUser(email);
    if (!sharedAuthUser) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await verifyPassword(password, sharedAuthUser.encryptedPassword);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const user = await ensureAfuCloudProfile(sharedAuthUser);
    const accessToken = signAccessToken({ userId: sharedAuthUser.id, email: sharedAuthUser.email ?? email });
    const rawRefresh = generateSecureToken();
    await db.insert(refreshTokensTable).values({
      userId: sharedAuthUser.id,
      tokenHash: hashToken(rawRefresh),
      expiresAt: refreshTokenExpiresAt(),
    });
    res.json({
      user: toApiUser(sharedAuthUser, user),
      accessToken,
      refreshToken: rawRefresh,
    });
  } catch (error) {
    authUnavailable(res, "auth.login", error);
  }
});

// POST /v1/auth/logout
router.post("/v1/auth/logout", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { refreshToken } = req.body ?? {};
  if (refreshToken) {
    await db.delete(refreshTokensTable).where(eq(refreshTokensTable.tokenHash, hashToken(refreshToken)));
  }
  res.json({ message: "Logged out" });
});

// POST /v1/auth/refresh
router.post("/v1/auth/refresh", async (req, res): Promise<void> => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken is required" });
    return;
  }
  const [record] = await db.select().from(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, hashToken(refreshToken))).limit(1);
  if (!record || record.expiresAt < new Date()) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  const [authUser] = await db.select().from(authUsersTable).where(eq(authUsersTable.id, record.userId)).limit(1);
  if (!authUser) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const user = await ensureAfuCloudProfile(authUser);
  const accessToken = signAccessToken({ userId: authUser.id, email: authUser.email ?? "" });
  const newRaw = generateSecureToken();
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.id, record.id));
  await db.insert(refreshTokensTable).values({
    userId: authUser.id,
    tokenHash: hashToken(newRaw),
    expiresAt: refreshTokenExpiresAt(),
  });
  res.json({
    user: toApiUser(authUser, user),
    accessToken,
    refreshToken: newRaw,
  });
});

// GET /v1/auth/me
router.get("/v1/auth/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [authUser] = await db.select().from(authUsersTable).where(eq(authUsersTable.id, req.userId!)).limit(1);
  if (!authUser) { res.status(404).json({ error: "User not found" }); return; }
  const profile = await ensureAfuCloudProfile(authUser);
  res.json(toApiUser(authUser, profile));
});

// PATCH /v1/auth/me/update
router.patch("/v1/auth/me/update", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { name, avatar } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (avatar !== undefined) updates.avatar = avatar;
  const [profile] = await db.update(profilesTable).set(updates).where(eq(profilesTable.userId, req.userId!)).returning();
  const [authUser] = await db.select().from(authUsersTable).where(eq(authUsersTable.id, req.userId!)).limit(1);
  if (!profile || !authUser) { res.status(404).json({ error: "User not found" }); return; }
  res.json(toApiUser(authUser, profile));
});

// PATCH /v1/auth/me/password
router.patch("/v1/auth/me/password", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  const [authUser] = await db.select().from(authUsersTable).where(eq(authUsersTable.id, req.userId!)).limit(1);
  if (!authUser) { res.status(404).json({ error: "User not found" }); return; }
  const valid = await verifyPassword(currentPassword, authUser.encryptedPassword);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const encryptedPassword = await hashPassword(newPassword);
  await db.update(authUsersTable)
    .set({ encryptedPassword, updatedAt: new Date() })
    .where(eq(authUsersTable.id, req.userId!));
  res.json({ message: "Password updated successfully" });
});

// POST /v1/auth/forgot-password (stub)
router.post("/v1/auth/forgot-password", async (_req, res): Promise<void> => {
  res.json({ message: "If that email exists, a reset link has been sent." });
});

// POST /v1/auth/reset-password (stub)
router.post("/v1/auth/reset-password", async (_req, res): Promise<void> => {
  res.json({ message: "Password reset successfully." });
});

export default router;
