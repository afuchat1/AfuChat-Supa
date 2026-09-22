import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { copyObject, deleteObject, generateUploadUrl, getPublicUrl } from "../lib/storage";

const storageContainers = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function objectApi(object: any, containerId: string, env: Env, cdnUrl: string | null) {
  return {
    id: object.id,
    containerId,
    key: object.object_key,
    name: object.name,
    contentType: object.content_type ?? null,
    size: object.size ?? 0,
    etag: object.etag ?? null,
    isFolder: object.is_folder,
    url: object.is_folder ? null : (cdnUrl ? `${cdnUrl.replace(/\/$/, "")}/${object.object_key}` : getPublicUrl(object.object_key, env)),
    createdAt: object.created_at,
    updatedAt: object.updated_at,
  };
}

async function cdnUrl(db: ReturnType<typeof createDbClient>, container: any, userId: string): Promise<string | null> {
  if (!container.cdn_enabled || !container.cdn_hostname_id) return null;
  const hostnames = await db.getHostnamesForCdn(userId, container.cdn_hostname_id);
  return hostnames[0]?.status === "active" ? `https://${hostnames[0].hostname}` : null;
}

async function stats(db: ReturnType<typeof createDbClient>, container: any, userId: string) {
  const objects = await db.getStorageObjects(container.id, userId);
  const files = objects.filter(object => !object.is_folder);
  return {
    objectCount: files.length,
    storageUsed: files.reduce((total, object) => total + Number(object.size ?? 0), 0),
  };
}

storageContainers.get("/", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const containers = await db.getStorageContainers(c.get("userId"));
  return c.json(await Promise.all(containers.map(async container => {
    const containerStats = await stats(db, container, c.get("userId"));
    return {
      ...container,
      ...containerStats,
      cdnUrl: await cdnUrl(db, container, c.get("userId")),
    };
  })));
});

storageContainers.post("/", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (name.length < 2) return c.json({ error: "Container name is required" }, 400);
  const slug = slugify(name);
  const db = createDbClient(c.env);
  const existing = (await db.getStorageContainers(c.get("userId"))).find(container => container.slug === slug);
  if (existing) return c.json({ error: "A container with that name already exists" }, 409);
  const created = await db.createStorageContainer({
    user_id: c.get("userId"),
    name,
    slug,
    description: body.description || null,
    project_id: body.projectId || null,
  });
  return c.json({ ...created, objectCount: 0, storageUsed: 0, cdnUrl: null }, 201);
});

storageContainers.get("/:id", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  return c.json({ ...container, cdnUrl: await cdnUrl(db, container, c.get("userId")) });
});

storageContainers.patch("/:id", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return c.json({ error: "Name cannot be empty" }, 400);
    updates.name = name;
    updates.slug = slugify(name);
  }
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.accessMode !== undefined && ["private", "public"].includes(body.accessMode)) updates.access_mode = body.accessMode;
  const updated = await db.updateStorageContainer(container.id, c.get("userId"), updates);
  return c.json({ ...updated, cdnUrl: await cdnUrl(db, updated, c.get("userId")) });
});

storageContainers.delete("/:id", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const objects = await db.getStorageObjects(container.id, c.get("userId"));
  await Promise.allSettled(objects.filter(object => !object.is_folder).map(object => deleteObject(object.object_key, c.env)));
  await db.deleteStorageContainer(container.id, c.get("userId"));
  return c.json({ message: "Container deleted" });
});

storageContainers.get("/:id/objects", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const prefix = (c.req.query("prefix") ?? "").replace(/^\/+|\/+$/g, "");
  const objects = (await db.getStorageObjects(container.id, c.get("userId"), prefix)).filter(object => {
    const relative = prefix ? object.object_key.slice(prefix.length + 1) : object.object_key;
    return !relative.includes("/");
  });
  const baseCdnUrl = await cdnUrl(db, container, c.get("userId"));
  return c.json({ prefix, objects: objects.map(object => objectApi(object, container.id, c.env, baseCdnUrl)) });
});

storageContainers.post("/:id/folders", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const name = String((await c.req.json().catch(() => ({}))).name ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!name || name.includes("..")) return c.json({ error: "Enter a valid folder path" }, 400);
  const folder = await db.createStorageObject({
    container_id: container.id,
    user_id: c.get("userId"),
    object_key: name,
    name: name.split("/").pop(),
    is_folder: true,
  });
  return c.json(objectApi(folder, container.id, c.env, null), 201);
});

storageContainers.post("/:id/upload-url", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().replace(/^\/+/, "");
  const contentType = String(body.contentType ?? "application/octet-stream");
  if (!name || name.includes("..")) return c.json({ error: "Object name is required" }, 400);
  const key = `containers/${c.get("userId")}/${container.id}/${name}`;
  const uploadUrl = await generateUploadUrl(key, contentType, c.env);
  return c.json({ uploadUrl, objectId: crypto.randomUUID(), key, name });
});

// POST /v1/storage-containers/:id/upload
// Proxy bytes through the canonical AfuCloud API. This is the web/native
// fallback when a browser or device cannot PUT to the presigned R2 URL.
storageContainers.post("/:id/upload", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const name = (c.req.query("name") ?? "").trim().replace(/^\/+/, "");
  const contentType = (c.req.header("content-type") ?? "application/octet-stream").split(";")[0].trim();
  if (!name || name.includes("..")) return c.json({ error: "Object name is required" }, 400);
  if (!c.req.raw.body) return c.json({ error: "Empty file body. Nothing to upload." }, 400);

  const key = `containers/${c.get("userId")}/${container.id}/${name}`;
  const object = await c.env.IMAGES_BUCKET.put(key, c.req.raw.body, {
    httpMetadata: { contentType },
  });
  return c.json({
    key,
    etag: object.etag,
    size: object.size,
    name,
  });
});

storageContainers.post("/:id/objects/confirm", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().replace(/^\/+/, "");
  const key = String(body.key ?? "");
  const prefix = `containers/${c.get("userId")}/${container.id}/`;
  if (!name || !key.startsWith(prefix)) return c.json({ error: "Invalid object confirmation" }, 400);
  const existing = await db.getStorageObjectByKey(key, container.id, c.get("userId"));
  if (existing) {
    return c.json(objectApi(existing, container.id, c.env, await cdnUrl(db, container, c.get("userId"))));
  }
  const object = await db.createStorageObject({
    container_id: container.id,
    user_id: c.get("userId"),
    object_key: key,
    name,
    content_type: body.contentType || null,
    size: Number(body.size ?? 0),
    etag: body.etag || null,
  });
  return c.json(objectApi(object, container.id, c.env, await cdnUrl(db, container, c.get("userId"))), 201);
});

storageContainers.delete("/:id/objects/by-key", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const key = String(body.key ?? "").trim();
  if (!key) return c.json({ error: "Object key is required" }, 400);
  const object = await db.getStorageObjectByKey(key, container.id, c.get("userId"));
  if (!object) return c.json({ error: "Object not found" }, 404);
  await deleteObject(object.object_key, c.env).catch(() => {});
  await db.deleteStorageObject(object.id, container.id, c.get("userId"));
  return c.json({ message: "Object deleted" });
});

storageContainers.get("/:containerId/objects/:objectId", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("containerId"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const object = await db.getStorageObject(c.req.param("objectId"), container.id, c.get("userId"));
  if (!object) return c.json({ error: "Object not found" }, 404);
  return c.json(objectApi(object, container.id, c.env, await cdnUrl(db, container, c.get("userId"))));
});

storageContainers.patch("/:containerId/objects/:objectId", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("containerId"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const object = await db.getStorageObject(c.req.param("objectId"), container.id, c.get("userId"));
  if (!object) return c.json({ error: "Object not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? object.name).trim().replace(/^\/+/, "");
  if (!name || name.includes("..")) return c.json({ error: "Invalid object name" }, 400);
  const prefix = object.object_key.includes("/") ? object.object_key.slice(0, object.object_key.lastIndexOf("/") + 1) : "";
  const nextKey = object.is_folder ? name : `${prefix}${name}`;
  if (!object.is_folder && nextKey !== object.object_key) {
    await copyObject(object.object_key, nextKey, c.env);
    await deleteObject(object.object_key, c.env);
  }
  const updated = await db.updateStorageObject(object.id, container.id, c.get("userId"), {
    name,
    object_key: nextKey,
  });
  return c.json(objectApi(updated, container.id, c.env, await cdnUrl(db, container, c.get("userId"))));
});

storageContainers.delete("/:containerId/objects/:objectId", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("containerId"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const object = await db.getStorageObject(c.req.param("objectId"), container.id, c.get("userId"));
  if (!object) return c.json({ error: "Object not found" }, 404);
  if (!object.is_folder) await deleteObject(object.object_key, c.env).catch(() => {});
  await db.deleteStorageObject(object.id, container.id, c.get("userId"));
  return c.json({ message: "Object deleted" });
});

storageContainers.patch("/:id/cdn", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const container = await db.getStorageContainer(c.req.param("id"), c.get("userId"));
  if (!container) return c.json({ error: "Container not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  if (!body.enabled) {
    const updated = await db.updateStorageContainer(container.id, c.get("userId"), {
      cdn_enabled: false,
      cdn_hostname_id: null,
      cdn_status: "disabled",
    });
    return c.json({ ...updated, cdnUrl: null });
  }
  const hostnameId = String(body.hostnameId ?? "");
  const hostnames = await db.getHostnamesForCdn(c.get("userId"), hostnameId);
  const domains = await db.getDomains(c.get("userId"));
  const hostname = hostnames.find(item => item.service === "cdn" && item.status === "active");
  const domain = domains.find(item => item.id === hostname?.domain_id && item.verification_status === "verified");
  if (!hostname || !domain) return c.json({ error: "Select one of your verified CDN hostnames" }, 400);
  const updated = await db.updateStorageContainer(container.id, c.get("userId"), {
    cdn_enabled: true,
    cdn_hostname_id: hostname.id,
    cdn_status: "active",
  });
  return c.json({ ...updated, cdnUrl: `https://${hostname.hostname}`, cdnStatus: "active" });
});

export default storageContainers;