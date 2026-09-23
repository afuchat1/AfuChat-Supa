import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, apiKeysTable, projectsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { generateTokenWithPrefix } from "../lib/auth";

const router: IRouter = Router();

async function assertProjectOwner(projectId: string, userId: string, res: Parameters<Parameters<typeof router.get>[1]>[1]): Promise<boolean> {
  const [p] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId))).limit(1);
  if (!p) { res.status(404).json({ error: "Project not found" }); return false; }
  return true;
}

function toApiKey(k: typeof apiKeysTable.$inferSelect) {
  return {
    id: k.id, projectId: k.projectId, name: k.name, environment: k.environment,
    prefix: k.prefix, scopes: k.scopes ?? [],
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  };
}

// GET /v1/projects/:projectId/api-keys
router.get("/v1/projects/:projectId/api-keys", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const keys = await db.select().from(apiKeysTable).where(eq(apiKeysTable.projectId, projectId));
  res.json(keys.map(toApiKey));
});

// POST /v1/projects/:projectId/api-keys
router.post("/v1/projects/:projectId/api-keys", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const { name, environment = "development", scopes = [] } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const envPrefix = environment === "production" ? "afu_prod" : environment === "testing" ? "afu_test" : "afu_dev";
  const { raw, hashed, prefix } = generateTokenWithPrefix(envPrefix);
  const [key] = await db.insert(apiKeysTable).values({
    projectId, name, environment, prefix, keyHash: hashed, scopes,
  }).returning();
  res.status(201).json({ ...toApiKey(key), secret: raw });
});

// DELETE /v1/projects/:projectId/api-keys/:id
router.delete("/v1/projects/:projectId/api-keys/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const [deleted] = await db.delete(apiKeysTable).where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.projectId, projectId))).returning();
  if (!deleted) { res.status(404).json({ error: "API key not found" }); return; }
  res.json({ message: "API key revoked" });
});

export default router;
