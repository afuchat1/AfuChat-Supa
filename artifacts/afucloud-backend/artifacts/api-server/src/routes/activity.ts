import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, activityLogsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// GET /v1/activity
router.get("/v1/activity", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, limit = "50" } = req.query as Record<string, string>;
  const lim = Math.min(200, parseInt(limit, 10) || 50);
  const conditions = [eq(activityLogsTable.userId, req.userId!)];
  if (projectId) conditions.push(eq(activityLogsTable.projectId, projectId));
  const logs = await db.select().from(activityLogsTable).where(and(...conditions)).orderBy(desc(activityLogsTable.createdAt)).limit(lim);
  res.json(logs.map(l => ({
    id: l.id, userId: l.userId, projectId: l.projectId, action: l.action,
    resource: l.resource, resourceId: l.resourceId, metadata: l.metadata,
    createdAt: l.createdAt.toISOString(),
  })));
});

export default router;
