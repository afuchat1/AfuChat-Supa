import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, webhooksTable, projectsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function assertProjectOwner(projectId: string, userId: string, res: Parameters<Parameters<typeof router.get>[1]>[1]): Promise<boolean> {
  const [p] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId))).limit(1);
  if (!p) { res.status(404).json({ error: "Project not found" }); return false; }
  return true;
}

function toWebhook(w: typeof webhooksTable.$inferSelect) {
  return {
    id: w.id, projectId: w.projectId, url: w.url, events: w.events ?? [],
    active: w.active, createdAt: w.createdAt.toISOString(),
  };
}

// GET /v1/projects/:projectId/webhooks
router.get("/v1/projects/:projectId/webhooks", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const webhooks = await db.select().from(webhooksTable).where(eq(webhooksTable.projectId, projectId));
  res.json(webhooks.map(toWebhook));
});

// POST /v1/projects/:projectId/webhooks
router.post("/v1/projects/:projectId/webhooks", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const { url, events, secret } = req.body ?? {};
  if (!url || !events) { res.status(400).json({ error: "url and events are required" }); return; }
  const [webhook] = await db.insert(webhooksTable).values({ projectId, url, events, secret }).returning();
  res.status(201).json(toWebhook(webhook));
});

// PATCH /v1/projects/:projectId/webhooks/:id
router.patch("/v1/projects/:projectId/webhooks/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const { url, events, active, secret } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (url != null) updates.url = url;
  if (events != null) updates.events = events;
  if (active != null) updates.active = active;
  if (secret !== undefined) updates.secret = secret;
  const [updated] = await db.update(webhooksTable).set(updates).where(and(eq(webhooksTable.id, id), eq(webhooksTable.projectId, projectId))).returning();
  if (!updated) { res.status(404).json({ error: "Webhook not found" }); return; }
  res.json(toWebhook(updated));
});

// DELETE /v1/projects/:projectId/webhooks/:id
router.delete("/v1/projects/:projectId/webhooks/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const [deleted] = await db.delete(webhooksTable).where(and(eq(webhooksTable.id, id), eq(webhooksTable.projectId, projectId))).returning();
  if (!deleted) { res.status(404).json({ error: "Webhook not found" }); return; }
  res.json({ message: "Webhook deleted" });
});

export default router;
