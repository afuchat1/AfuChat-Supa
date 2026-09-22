import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { requireAuth } from "../middleware/auth";

const analytics = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /v1/analytics/overview
analytics.get("/overview", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const projects = await db.getProjects(c.get("userId"));
  let totalImages = 0, totalStorageUsed = 0, recentUploads = 0;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  await Promise.all(projects.map(async (p: any) => {
    const stats = await db.getImageStats(p.id);
    totalImages += stats.totalImages;
    totalStorageUsed += stats.storageUsed;
  }));

  return c.json({
    totalProjects: projects.length,
    totalImages,
    totalStorageUsed,
    totalBandwidth: 0,
    totalApiRequests: 0,
    recentUploads,
  });
});

// GET /v1/projects/:projectId/analytics
analytics.get("/projects/:projectId", requireAuth, async (c) => {
  const projectId = c.req.param("projectId");
  const db = createDbClient(c.env);
  const project = await db.getProject(projectId, c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const period = c.req.query("period") ?? "30d";
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const stats = await db.getImageStats(projectId);

  // Generate placeholder daily stats (real analytics would need a separate events table)
  const dailyStats = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return { date: d.toISOString().slice(0, 10), uploads: 0, downloads: 0, bandwidth: 0 };
  });

  return c.json({
    uploads: stats.totalImages,
    downloads: 0,
    storageUsed: stats.storageUsed,
    bandwidth: 0,
    apiRequests: 0,
    dailyStats,
  });
});

export default analytics;
