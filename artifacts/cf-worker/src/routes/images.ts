import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { generateUploadUrl, buildStorageKey, getPublicUrl, deleteObject } from "../lib/storage";
import { dispatchWebhook } from "./webhooks";

const images = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function toApiImage(img: any, env: Env) {
  return {
    id: img.id,
    projectId: img.project_id,
    name: img.name,
    originalName: img.original_name,
    url: getPublicUrl(img.storage_key, env),
    publicUrl: getPublicUrl(img.storage_key, env),
    format: img.format,
    size: img.size,
    width: img.width,
    height: img.height,
    favorite: img.favorite,
    tags: img.tags ?? [],
    album: img.album,
    deletedAt: img.deleted_at ?? null,
    createdAt: img.created_at,
    updatedAt: img.updated_at ?? null,
  };
}

async function assertProjectOwner(db: ReturnType<typeof createDbClient>, projectId: string, userId: string): Promise<boolean> {
  const project = await db.getProject(projectId, userId);
  return !!project;
}

// GET /v1/projects/:projectId/images
images.get("/", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const result = await db.getImages(projectId, query);
  return c.json({ images: result.images.map(img => toApiImage(img, c.env)), total: result.total, page: parseInt(query.page ?? "1"), limit: parseInt(query.limit ?? "50") });
});

// GET /v1/projects/:projectId/images/trash
images.get("/trash", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const deleted = await db.getDeletedImages(projectId);
  return c.json({ images: deleted.map(img => toApiImage(img, c.env)), total: deleted.length });
});

// DELETE /v1/projects/:projectId/images/trash (empty trash)
images.delete("/trash", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const deleted = await db.emptyTrash(projectId);
  Promise.allSettled(deleted.map((img: any) => deleteObject(img.storage_key, c.env)));
  return c.json({ message: `${deleted.length} images permanently deleted`, count: deleted.length });
});

// POST /v1/projects/:projectId/images/upload-url
images.post("/upload-url", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const { filename, contentType, name } = await c.req.json().catch(() => ({}));
  if (!filename || !contentType) return c.json({ error: "filename and contentType are required" }, 400);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const imageId = crypto.randomUUID();
  const key = buildStorageKey(c.get("userId"), projectId, imageId, ext);
  const uploadUrl = await generateUploadUrl(key, contentType, c.env);
  await db.createImage({ id: imageId, project_id: projectId, name: name ?? filename, original_name: filename, storage_key: key, format: ext, size: 0, tags: [] });
  return c.json({ uploadUrl, imageId, key });
});

// POST /v1/projects/:projectId/images/confirm-upload
images.post("/confirm-upload", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const { imageId, key, width, height, size, tags, album } = await c.req.json().catch(() => ({}));
  if (!imageId || !key) return c.json({ error: "imageId and key are required" }, 400);
  const updates: Record<string, unknown> = {};
  if (width != null) updates.width = width;
  if (height != null) updates.height = height;
  if (size != null) updates.size = size;
  if (tags != null) updates.tags = tags;
  if (album != null) updates.album = album;
  const img = await db.updateImage(imageId, updates);
  if (!img) return c.json({ error: "Image not found" }, 404);
  await db.logActivity({ user_id: c.get("userId"), project_id: projectId, action: "upload", resource: "image", resource_id: imageId });
  c.executionCtx.waitUntil(dispatchWebhook(projectId, "image.uploaded", toApiImage(img, c.env), c.env));
  return c.json(toApiImage(img, c.env), 201);
});

// GET /v1/projects/:projectId/images/:id
images.get("/:id", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const id = c.req.param("id")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const img = await db.getImage(id, projectId);
  if (!img) return c.json({ error: "Image not found" }, 404);
  return c.json(toApiImage(img, c.env));
});

// PATCH /v1/projects/:projectId/images/:id
images.patch("/:id", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const id = c.req.param("id")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const { name, tags, album } = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (tags != null) updates.tags = tags;
  if (album !== undefined) updates.album = album;
  const img = await db.updateImage(id, updates);
  if (!img) return c.json({ error: "Image not found" }, 404);
  c.executionCtx.waitUntil(dispatchWebhook(projectId, "image.updated", toApiImage(img, c.env), c.env));
  return c.json(toApiImage(img, c.env));
});

// DELETE /v1/projects/:projectId/images/:id (soft delete)
images.delete("/:id", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const id = c.req.param("id")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const img = await db.softDeleteImage(id);
  if (!img) return c.json({ error: "Image not found" }, 404);
  c.executionCtx.waitUntil(dispatchWebhook(projectId, "image.deleted", { ...toApiImage(img, c.env), deleted: true }, c.env));
  return c.json({ message: "Image moved to trash" });
});

// PATCH /v1/projects/:projectId/images/:id/favorite
images.patch("/:id/favorite", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const id = c.req.param("id")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const current = await db.getImage(id, projectId);
  if (!current) return c.json({ error: "Image not found" }, 404);
  const img = await db.updateImage(id, { favorite: !current.favorite });
  c.executionCtx.waitUntil(dispatchWebhook(projectId, "image.updated", toApiImage(img, c.env), c.env));
  return c.json(toApiImage(img, c.env));
});

// POST /v1/projects/:projectId/images/:id/restore
images.post("/:id/restore", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const id = c.req.param("id")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const img = await db.restoreImage(id);
  if (!img) return c.json({ error: "Image not found" }, 404);
  c.executionCtx.waitUntil(dispatchWebhook(projectId, "image.updated", toApiImage(img, c.env), c.env));
  return c.json(toApiImage(img, c.env));
});

// DELETE /v1/projects/:projectId/images/:id/permanent
images.delete("/:id/permanent", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const id = c.req.param("id")!;
  const db = createDbClient(c.env);
  if (!await assertProjectOwner(db, projectId, c.get("userId"))) return c.json({ error: "Project not found" }, 404);
  const img = await db.hardDeleteImage(id);
  if (!img) return c.json({ error: "Image not found" }, 404);
  deleteObject(img.storage_key, c.env).catch(() => {});
  c.executionCtx.waitUntil(dispatchWebhook(projectId, "image.deleted", { imageId: id, projectId, deleted: true }, c.env));
  return c.json({ message: "Image permanently deleted" });
});

export default images;
