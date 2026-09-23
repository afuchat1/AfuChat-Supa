import { Router, type IRouter } from "express";
import { eq, and, isNull, isNotNull, sql, desc } from "drizzle-orm";
import { db, imagesTable, projectsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { generateUploadUrl, buildStorageKey, getPublicUrl, getDownloadUrl, deleteObject } from "../lib/storage";
import crypto from "crypto";

const router: IRouter = Router();

function toApiImage(img: typeof imagesTable.$inferSelect) {
  const downloadName = `afuchat-${(img.originalName || img.name || "image").split(/[\\/]/).pop()!.replace(/["\\\r\n]/g, "_")}`;
  return {
    id: img.id,
    projectId: img.projectId,
    name: img.name,
    originalName: img.originalName,
    url: getPublicUrl(img.storageKey),
    publicUrl: getPublicUrl(img.storageKey),
    downloadUrl: getDownloadUrl(img.storageKey, downloadName),
    format: img.format,
    size: img.size,
    width: img.width,
    height: img.height,
    favorite: img.favorite,
    tags: img.tags ?? [],
    album: img.album,
    deletedAt: img.deletedAt?.toISOString() ?? null,
    createdAt: img.createdAt.toISOString(),
    updatedAt: img.updatedAt?.toISOString() ?? null,
  };
}

async function assertProjectOwner(
  projectId: string,
  userId: string,
  res: Parameters<Parameters<typeof router.get>[1]>[1],
): Promise<boolean> {
  const [p] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
    .limit(1);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return false;
  }
  return true;
}

// ─── List images ──────────────────────────────────────────────────────────────
router.get("/v1/projects/:projectId/images", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const { search, tag, album, format, favorite, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(200, parseInt(limit, 10) || 50);
  const offset = (pg - 1) * lim;

  const conditions = [eq(imagesTable.projectId, projectId), isNull(imagesTable.deletedAt)];
  if (search) conditions.push(sql`${imagesTable.name} ilike ${"%" + search + "%"}`);
  if (tag) conditions.push(sql`${tag} = any(${imagesTable.tags})`);
  if (album) conditions.push(eq(imagesTable.album, album));
  if (format) conditions.push(eq(imagesTable.format, format));
  if (favorite === "true") conditions.push(eq(imagesTable.favorite, true));

  const images = await db.select().from(imagesTable).where(and(...conditions)).orderBy(desc(imagesTable.createdAt)).limit(lim).offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(imagesTable).where(and(...conditions));
  res.json({ images: images.map(toApiImage), total: Number(total), page: pg, limit: lim });
});

// ─── Trash: list deleted images ───────────────────────────────────────────────
// NOTE: must come BEFORE /:id to avoid "trash" matching as an image ID
router.get("/v1/projects/:projectId/images/trash", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const images = await db
    .select()
    .from(imagesTable)
    .where(and(eq(imagesTable.projectId, projectId), isNotNull(imagesTable.deletedAt)))
    .orderBy(desc(imagesTable.deletedAt));
  res.json({ images: images.map(toApiImage), total: images.length });
});

// ─── Trash: empty (bulk permanent delete) ─────────────────────────────────────
router.delete("/v1/projects/:projectId/images/trash", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const deleted = await db
    .delete(imagesTable)
    .where(and(eq(imagesTable.projectId, projectId), isNotNull(imagesTable.deletedAt)))
    .returning();
  // Fire-and-forget R2 deletions (don't block the response)
  Promise.allSettled(deleted.map(img => deleteObject(img.storageKey)));
  res.json({ message: `${deleted.length} images permanently deleted`, count: deleted.length });
});

// ─── Get single image ─────────────────────────────────────────────────────────
router.get("/v1/projects/:projectId/images/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const [img] = await db.select().from(imagesTable).where(and(eq(imagesTable.id, id), eq(imagesTable.projectId, projectId))).limit(1);
  if (!img) { res.status(404).json({ error: "Image not found" }); return; }
  res.json(toApiImage(img));
});

// ─── Update image ─────────────────────────────────────────────────────────────
router.patch("/v1/projects/:projectId/images/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const [img] = await db.select().from(imagesTable).where(and(eq(imagesTable.id, id), eq(imagesTable.projectId, projectId))).limit(1);
  if (!img) { res.status(404).json({ error: "Image not found" }); return; }
  const { name, tags, album } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (tags != null) updates.tags = tags;
  if (album !== undefined) updates.album = album;
  const [updated] = await db.update(imagesTable).set(updates).where(eq(imagesTable.id, id)).returning();
  res.json(toApiImage(updated));
});

// ─── Soft delete ──────────────────────────────────────────────────────────────
router.delete("/v1/projects/:projectId/images/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const [updated] = await db
    .update(imagesTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(imagesTable.id, id), eq(imagesTable.projectId, projectId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Image not found" }); return; }
  res.json({ message: "Image moved to trash" });
});

// ─── Toggle favorite ──────────────────────────────────────────────────────────
router.patch("/v1/projects/:projectId/images/:id/favorite", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const [img] = await db.select().from(imagesTable).where(and(eq(imagesTable.id, id), eq(imagesTable.projectId, projectId))).limit(1);
  if (!img) { res.status(404).json({ error: "Image not found" }); return; }
  const [updated] = await db.update(imagesTable).set({ favorite: !img.favorite }).where(eq(imagesTable.id, id)).returning();
  res.json(toApiImage(updated));
});

// ─── Restore from trash ───────────────────────────────────────────────────────
router.post("/v1/projects/:projectId/images/:id/restore", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const [updated] = await db
    .update(imagesTable)
    .set({ deletedAt: null })
    .where(and(eq(imagesTable.id, id), eq(imagesTable.projectId, projectId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Image not found" }); return; }
  res.json(toApiImage(updated));
});

// ─── Permanent delete (hard delete from R2 + DB) ──────────────────────────────
router.delete("/v1/projects/:projectId/images/:id/permanent", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { projectId, id } = req.params as { projectId: string; id: string };
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const [img] = await db
    .delete(imagesTable)
    .where(and(eq(imagesTable.id, id), eq(imagesTable.projectId, projectId)))
    .returning();
  if (!img) { res.status(404).json({ error: "Image not found" }); return; }
  // Delete from R2 (fire-and-forget, don't fail if R2 is unavailable)
  deleteObject(img.storageKey).catch(() => {});
  res.json({ message: "Image permanently deleted" });
});

// ─── Get pre-signed upload URL ────────────────────────────────────────────────
router.post("/v1/projects/:projectId/images/upload-url", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const { filename, contentType, name } = req.body ?? {};
  if (!filename || !contentType) { res.status(400).json({ error: "filename and contentType are required" }); return; }
  const originalFilename = String(filename).split(/[\\/]/).pop()!.trim();
  const ext = originalFilename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const imageId = crypto.randomUUID();
  const key = buildStorageKey(req.userId!, projectId, imageId, ext);
  const uploadUrl = await generateUploadUrl(key, contentType);
  // Do not create the DB row until the browser confirms that the object upload
  // completed. This prevents interrupted uploads from appearing as broken images.
  res.json({ uploadUrl, imageId, key, originalName: originalFilename, name: name ?? originalFilename });
});

// ─── Confirm upload ───────────────────────────────────────────────────────────
router.post("/v1/projects/:projectId/images/confirm-upload", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const projectId = req.params.projectId as string;
  if (!await assertProjectOwner(projectId, req.userId!, res)) return;
  const { imageId, key, width, height, size, tags, album, originalName, name, contentType } = req.body ?? {};
  if (!imageId || !key) { res.status(400).json({ error: "imageId and key are required" }); return; }
  const expectedPrefix = `${req.userId}/${projectId}/`;
  if (typeof key !== "string" || !key.startsWith(expectedPrefix)) {
    res.status(400).json({ error: "Invalid storage key" });
    return;
  }
  const [existing] = await db.select().from(imagesTable)
    .where(and(eq(imagesTable.id, imageId), eq(imagesTable.projectId, projectId))).limit(1);
  if (existing) {
    const updates: Record<string, unknown> = {};
    if (width != null) updates.width = width;
    if (height != null) updates.height = height;
    if (size != null) updates.size = size;
    if (tags != null) updates.tags = tags;
    if (album != null) updates.album = album;
    const [updated] = await db.update(imagesTable).set(updates).where(eq(imagesTable.id, imageId)).returning();
    res.status(200).json(toApiImage(updated));
    return;
  }
  const normalizedOriginalName = String(originalName ?? name ?? "image").split(/[\\/]/).pop()!.trim() || "image";
  const ext = key.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const updates: Record<string, unknown> = {};
  if (width != null) updates.width = width;
  if (height != null) updates.height = height;
  if (size != null) updates.size = size;
  if (tags != null) updates.tags = tags;
  if (album != null) updates.album = album;
  const [img] = await db.insert(imagesTable).values({
    id: imageId,
    projectId,
    name: String(name ?? normalizedOriginalName),
    originalName: normalizedOriginalName,
    storageKey: key,
    format: ext,
    size: Number(size ?? 0),
    tags: Array.isArray(tags) ? tags : [],
    ...updates,
  }).returning();
  res.status(201).json(toApiImage(img));
});

export default router;
