import { Router, type IRouter } from "express";
import { eq, and, isNull, sql, count } from "drizzle-orm";
import { db, projectsTable, imagesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// GET /v1/analytics/overview
router.get("/v1/analytics/overview", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projects = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.userId, req.userId!));
  const projectIds = projects.map(p => p.id);

  let totalImages = 0;
  let totalStorageUsed = 0;
  let recentUploads = 0;

  if (projectIds.length > 0) {
    const [imgStats] = await db.select({
      total: count(imagesTable.id),
      storage: sql<number>`coalesce(sum(${imagesTable.size}), 0)`,
    }).from(imagesTable).where(and(isNull(imagesTable.deletedAt), sql`${imagesTable.projectId} = any(${sql.raw("ARRAY['" + projectIds.join("','") + "']::uuid[]")})`));
    totalImages = Number(imgStats?.total ?? 0);
    totalStorageUsed = Number(imgStats?.storage ?? 0);

    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [recent] = await db.select({ count: count(imagesTable.id) }).from(imagesTable)
      .where(and(isNull(imagesTable.deletedAt), sql`${imagesTable.createdAt} >= ${sevenDaysAgo}`, sql`${imagesTable.projectId} = any(${sql.raw("ARRAY['" + projectIds.join("','") + "']::uuid[]")})`));
    recentUploads = Number(recent?.count ?? 0);
  }

  res.json({
    totalProjects: projects.length,
    totalImages,
    totalStorageUsed,
    totalBandwidth: 0,
    totalApiRequests: 0,
    recentUploads,
  });
});

// GET /v1/projects/:projectId/analytics
router.get("/v1/projects/:projectId/analytics", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  const [p] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!))).limit(1);
  if (!p) { res.status(404).json({ error: "Project not found" }); return; }

  const period = (req.query.period as string) ?? "30d";
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

  // Generate daily stats from actual upload data
  const dailyStats: { date: string; uploads: number; downloads: number; bandwidth: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const start = new Date(dateStr);
    const end = new Date(dateStr); end.setDate(end.getDate() + 1);
    const [row] = await db.select({ count: count(imagesTable.id) }).from(imagesTable)
      .where(and(eq(imagesTable.projectId, projectId), sql`${imagesTable.createdAt} >= ${start}`, sql`${imagesTable.createdAt} < ${end}`));
    dailyStats.push({ date: dateStr, uploads: Number(row?.count ?? 0), downloads: 0, bandwidth: 0 });
  }

  const [totals] = await db.select({
    imageCount: count(imagesTable.id),
    storageUsed: sql<number>`coalesce(sum(${imagesTable.size}), 0)`,
  }).from(imagesTable).where(and(eq(imagesTable.projectId, projectId), isNull(imagesTable.deletedAt)));

  res.json({
    uploads: dailyStats.reduce((a, b) => a + b.uploads, 0),
    downloads: 0,
    storageUsed: Number(totals?.storageUsed ?? 0),
    bandwidth: 0,
    apiRequests: 0,
    dailyStats,
  });
});

export default router;
