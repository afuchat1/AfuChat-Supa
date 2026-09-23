import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, personalTokensTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { generateTokenWithPrefix } from "../lib/auth";

const router: IRouter = Router();

function toToken(t: typeof personalTokensTable.$inferSelect) {
  return {
    id: t.id, name: t.name, description: t.description, prefix: t.prefix,
    scopes: t.scopes ?? [],
    expiresAt: t.expiresAt?.toISOString() ?? null,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

// GET /v1/tokens
router.get("/v1/tokens", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const tokens = await db.select().from(personalTokensTable).where(eq(personalTokensTable.userId, req.userId!));
  res.json(tokens.map(toToken));
});

// POST /v1/tokens
router.post("/v1/tokens", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { name, description, scopes = [], expiresAt } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const { raw, hashed, prefix } = generateTokenWithPrefix("pat");
  const [token] = await db.insert(personalTokensTable).values({
    userId: req.userId!, name, description, prefix, tokenHash: hashed, scopes,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();
  res.status(201).json({ ...toToken(token), secret: raw });
});

// DELETE /v1/tokens/:id
router.delete("/v1/tokens/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = req.params.id as string;
  const [deleted] = await db.delete(personalTokensTable).where(eq(personalTokensTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Token not found" }); return; }
  res.json({ message: "Token revoked" });
});

export default router;
