import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import crypto from "crypto";
import { db, domainsTable, hostnamesTable, storageContainersTable, storageObjectsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { copyObject, buildStorageKey, deleteObject, generateUploadUrl } from "../lib/storage";

const router: IRouter = Router();

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function objectApi(object: typeof storageObjectsTable.$inferSelect, containerId: string, cdnUrl?: string | null) {
  return {
    id: object.id,
    containerId,
    key: object.objectKey,
    name: object.name,
    contentType: object.contentType,
    size: object.size,
    etag: object.etag,
    isFolder: object.isFolder,
    url: object.isFolder ? null : (cdnUrl ? `${cdnUrl.replace(/\/$/, "")}/${object.objectKey}` : `/api/v1/storage/${encodeURIComponent(object.objectKey)}`),
    createdAt: object.createdAt.toISOString(),
    updatedAt: object.updatedAt.toISOString(),
  };
}

async function ownedContainer(id: string, userId: string) {
  const [container] = await db.select().from(storageContainersTable)
    .where(and(eq(storageContainersTable.id, id), eq(storageContainersTable.userId, userId))).limit(1);
  return container;
}

async function containerCdnUrl(container: typeof storageContainersTable.$inferSelect) {
  if (!container.cdnEnabled || !container.cdnHostnameId) return null;
  const [hostname] = await db.select().from(hostnamesTable)
    .where(and(eq(hostnamesTable.id, container.cdnHostnameId), eq(hostnamesTable.userId, container.userId))).limit(1);
  return hostname?.status === "active" ? `https://${hostname.hostname}` : null;
}

router.get("/v1/storage-containers", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const containers = await db.select().from(storageContainersTable)
    .where(eq(storageContainersTable.userId, req.userId!))
    .orderBy(desc(storageContainersTable.createdAt));
  const result = await Promise.all(containers.map(async container => {
    const [{ count, bytes }] = await db.select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(${storageObjectsTable.size}), 0)`,
    }).from(storageObjectsTable).where(and(eq(storageObjectsTable.containerId, container.id), eq(storageObjectsTable.isFolder, false)));
    return { ...container, objectCount: Number(count), storageUsed: Number(bytes), cdnUrl: await containerCdnUrl(container) };
  }));
  res.json(result);
});

router.post("/v1/storage-containers", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const name = String(req.body?.name ?? "").trim();
  if (name.length < 2) { res.status(400).json({ error: "Container name is required" }); return; }
  const slug = slugify(name);
  const [existing] = await db.select().from(storageContainersTable)
    .where(and(eq(storageContainersTable.userId, req.userId!), eq(storageContainersTable.slug, slug))).limit(1);
  if (existing) { res.status(409).json({ error: "A container with that name already exists" }); return; }
  const [container] = await db.insert(storageContainersTable).values({
    userId: req.userId!,
    name,
    slug,
    description: req.body?.description || null,
    projectId: req.body?.projectId || null,
  }).returning();
  res.status(201).json({ ...container, objectCount: 0, storageUsed: 0, cdnUrl: null });
});

router.get("/v1/storage-containers/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.id as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  res.json({ ...container, cdnUrl: await containerCdnUrl(container) });
});

router.patch("/v1/storage-containers/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.id as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const updates: Record<string, unknown> = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) { res.status(400).json({ error: "Name cannot be empty" }); return; }
    updates.name = name;
    updates.slug = slugify(name);
  }
  if (req.body?.description !== undefined) updates.description = req.body.description || null;
  if (req.body?.accessMode !== undefined && ["private", "public"].includes(req.body.accessMode)) updates.accessMode = req.body.accessMode;
  const [updated] = await db.update(storageContainersTable).set(updates).where(eq(storageContainersTable.id, container.id)).returning();
  res.json({ ...updated, cdnUrl: await containerCdnUrl(updated) });
});

router.delete("/v1/storage-containers/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.id as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const objects = await db.select().from(storageObjectsTable).where(and(eq(storageObjectsTable.containerId, container.id), eq(storageObjectsTable.isFolder, false)));
  await Promise.allSettled(objects.map(object => deleteObject(object.objectKey)));
  await db.delete(storageContainersTable).where(eq(storageContainersTable.id, container.id));
  res.json({ message: "Container deleted" });
});

router.get("/v1/storage-containers/:id/objects", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.id as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const prefix = String(req.query.prefix ?? "").replace(/^\/+|\/+$/g, "");
  const objects = await db.select().from(storageObjectsTable)
    .where(and(
      eq(storageObjectsTable.containerId, container.id),
      prefix ? ilike(storageObjectsTable.objectKey, `${prefix}/%`) : sql`true`,
    ))
    .orderBy(asc(storageObjectsTable.isFolder), asc(storageObjectsTable.name));
  const directObjects = objects.filter(object => {
    const relative = prefix ? object.objectKey.slice(prefix.length + 1) : object.objectKey;
    return !relative.includes("/");
  });
  const cdnUrl = await containerCdnUrl(container);
  res.json({ prefix, objects: directObjects.map(object => objectApi(object, container.id, cdnUrl)) });
});

router.post("/v1/storage-containers/:id/folders", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.id as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const name = String(req.body?.name ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!name || name.includes("..")) { res.status(400).json({ error: "Enter a valid folder path" }); return; }
  const [folder] = await db.insert(storageObjectsTable).values({
    containerId: container.id,
    userId: req.userId!,
    objectKey: name,
    name: name.split("/").pop()!,
    isFolder: true,
  }).returning();
  res.status(201).json(objectApi(folder, container.id));
});

router.post("/v1/storage-containers/:id/upload-url", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.id as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const name = String(req.body?.name ?? "").trim().replace(/^\/+/, "");
  const contentType = String(req.body?.contentType ?? "application/octet-stream");
  if (!name || name.includes("..")) { res.status(400).json({ error: "Object name is required" }); return; }
  const objectId = crypto.randomUUID();
  const key = `containers/${req.userId}/${container.id}/${name}`;
  const uploadUrl = await generateUploadUrl(key, contentType);
  res.json({ uploadUrl, objectId, key, name });
});

router.post("/v1/storage-containers/:id/objects/confirm", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.id as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const name = String(req.body?.name ?? "").trim().replace(/^\/+/, "");
  const key = String(req.body?.key ?? "");
  if (!name || !key.startsWith(`containers/${req.userId}/${container.id}/`)) {
    res.status(400).json({ error: "Invalid object confirmation" }); return;
  }
  const [object] = await db.insert(storageObjectsTable).values({
    containerId: container.id,
    userId: req.userId!,
    objectKey: key,
    name,
    contentType: req.body?.contentType || null,
    size: Number(req.body?.size ?? 0),
    etag: req.body?.etag || null,
  }).returning();
  res.status(201).json(objectApi(object, container.id, await containerCdnUrl(container)));
});

router.get("/v1/storage-containers/:containerId/objects/:objectId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.containerId as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const [object] = await db.select().from(storageObjectsTable).where(and(
    eq(storageObjectsTable.id, req.params.objectId as string),
    eq(storageObjectsTable.containerId, container.id),
    eq(storageObjectsTable.userId, req.userId!),
  )).limit(1);
  if (!object) { res.status(404).json({ error: "Object not found" }); return; }
  res.json(objectApi(object, container.id, await containerCdnUrl(container)));
});

router.patch("/v1/storage-containers/:containerId/objects/:objectId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.containerId as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const [object] = await db.select().from(storageObjectsTable).where(and(
    eq(storageObjectsTable.id, req.params.objectId as string),
    eq(storageObjectsTable.containerId, container.id),
    eq(storageObjectsTable.userId, req.userId!),
  )).limit(1);
  if (!object) { res.status(404).json({ error: "Object not found" }); return; }
  const name = String(req.body?.name ?? object.name).trim().replace(/^\/+/, "");
  if (!name || name.includes("..")) { res.status(400).json({ error: "Invalid object name" }); return; }
  const prefix = object.objectKey.includes("/") ? object.objectKey.slice(0, object.objectKey.lastIndexOf("/") + 1) : "";
  const nextKey = object.isFolder ? name : `${prefix}${name}`;
  if (!object.isFolder && nextKey !== object.objectKey) {
    await copyObject(object.objectKey, nextKey);
    await deleteObject(object.objectKey);
  }
  const [updated] = await db.update(storageObjectsTable).set({
    name,
    objectKey: nextKey,
  }).where(eq(storageObjectsTable.id, object.id)).returning();
  res.json(objectApi(updated, container.id, await containerCdnUrl(container)));
});

router.delete("/v1/storage-containers/:containerId/objects/:objectId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.containerId as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const [object] = await db.select().from(storageObjectsTable).where(and(
    eq(storageObjectsTable.id, req.params.objectId as string),
    eq(storageObjectsTable.containerId, container.id),
    eq(storageObjectsTable.userId, req.userId!),
  )).limit(1);
  if (!object) { res.status(404).json({ error: "Object not found" }); return; }
  if (!object.isFolder) await deleteObject(object.objectKey).catch(() => {});
  await db.delete(storageObjectsTable).where(eq(storageObjectsTable.id, object.id));
  res.json({ message: "Object deleted" });
});

router.patch("/v1/storage-containers/:id/cdn", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const container = await ownedContainer(req.params.id as string, req.userId!);
  if (!container) { res.status(404).json({ error: "Container not found" }); return; }
  const enabled = Boolean(req.body?.enabled);
  if (!enabled) {
    const [updated] = await db.update(storageContainersTable).set({
      cdnEnabled: false,
      cdnHostnameId: null,
      cdnStatus: "disabled",
    }).where(eq(storageContainersTable.id, container.id)).returning();
    res.json({ ...updated, cdnUrl: null });
    return;
  }
  const hostnameId = String(req.body?.hostnameId ?? "");
  const [hostname] = await db.select().from(hostnamesTable).innerJoin(domainsTable, eq(hostnamesTable.domainId, domainsTable.id)).where(and(
    eq(hostnamesTable.id, hostnameId),
    eq(hostnamesTable.userId, req.userId!),
    eq(hostnamesTable.service, "cdn"),
    eq(domainsTable.userId, req.userId!),
    eq(domainsTable.verificationStatus, "verified"),
  )).limit(1);
  if (!hostname) { res.status(400).json({ error: "Select one of your verified CDN hostnames" }); return; }
  const [updated] = await db.update(storageContainersTable).set({
    cdnEnabled: true,
    cdnHostnameId: hostname.hostnames.id,
    cdnStatus: "pending",
  }).where(eq(storageContainersTable.id, container.id)).returning();
  res.json({ ...updated, cdnUrl: `https://${hostname.hostnames.hostname}`, cdnStatus: "pending" });
});

export default router;