import { Router, type IRouter } from "express";
import { eq, and, sql, isNull, count } from "drizzle-orm";
import { db, projectsTable, imagesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60) + "-" + Math.random().toString(36).slice(2, 6);
}

async function getProjectWithStats(id: string, userId: string) {
  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, userId))).limit(1);
  if (!project) return null;

  const [statsRow] = await db.select({
    imageCount: count(imagesTable.id),
    storageUsed: sql<number>`coalesce(sum(${imagesTable.size}), 0)`,
  }).from(imagesTable).where(and(eq(imagesTable.projectId, id), isNull(imagesTable.deletedAt)));

  return { ...project, imageCount: Number(statsRow?.imageCount ?? 0), storageUsed: Number(statsRow?.storageUsed ?? 0) };
}

// GET /v1/projects
router.get("/v1/projects", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, req.userId!));
  const withStats = await Promise.all(projects.map(async (p) => {
    const [s] = await db.select({
      imageCount: count(imagesTable.id),
      storageUsed: sql<number>`coalesce(sum(${imagesTable.size}), 0)`,
    }).from(imagesTable).where(and(eq(imagesTable.projectId, p.id), isNull(imagesTable.deletedAt)));
    return { ...p, imageCount: Number(s?.imageCount ?? 0), storageUsed: Number(s?.storageUsed ?? 0) };
  }));
  res.json(withStats);
});

// POST /v1/projects
router.post("/v1/projects", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { name, description } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const slug = slugify(name);
  const [project] = await db.insert(projectsTable).values({ name, slug, description, userId: req.userId! }).returning();
  res.status(201).json({ ...project, imageCount: 0, storageUsed: 0 });
});

// GET /v1/projects/:id
router.get("/v1/projects/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const project = await getProjectWithStats(req.params.id as string, req.userId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(project);
});

// PATCH /v1/projects/:id
router.patch("/v1/projects/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.userId, req.userId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
  const { name, description } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (description !== undefined) updates.description = description;
  const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id)).returning();
  const project = await getProjectWithStats(updated.id, req.userId!);
  res.json(project);
});

// DELETE /v1/projects/:id
router.delete("/v1/projects/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.userId, req.userId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  res.json({ message: "Project deleted" });
});

// GET /v1/projects/:id/stats
router.get("/v1/projects/:id/stats", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.userId, req.userId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
  const [s] = await db.select({
    imageCount: count(imagesTable.id),
    storageUsed: sql<number>`coalesce(sum(${imagesTable.size}), 0)`,
  }).from(imagesTable).where(and(eq(imagesTable.projectId, id), isNull(imagesTable.deletedAt)));
  const [deleted] = await db.select({ deletedImages: count(imagesTable.id) }).from(imagesTable)
    .where(and(eq(imagesTable.projectId, id), sql`${imagesTable.deletedAt} is not null`));
  const [fav] = await db.select({ favoriteImages: count(imagesTable.id) }).from(imagesTable)
    .where(and(eq(imagesTable.projectId, id), eq(imagesTable.favorite, true), isNull(imagesTable.deletedAt)));
  res.json({
    totalImages: Number(s?.imageCount ?? 0),
    storageUsed: Number(s?.storageUsed ?? 0),
    bandwidth: 0,
    apiRequests: 0,
    deletedImages: Number(deleted?.deletedImages ?? 0),
    favoriteImages: Number(fav?.favoriteImages ?? 0),
  });
});

export default router;
