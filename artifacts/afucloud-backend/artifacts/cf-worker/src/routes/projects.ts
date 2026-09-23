import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { dispatchWebhook } from "./webhooks";

const projects = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60)
    + "-" + Math.random().toString(36).slice(2, 6);
}

async function withStats(db: ReturnType<typeof createDbClient>, project: any) {
  const stats = await db.getImageStats(project.id);
  return { ...project, imageCount: stats.totalImages, storageUsed: stats.storageUsed };
}

// GET /v1/projects
projects.get("/", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const list = await db.getProjects(c.get("userId"));
  const withStatsList = await Promise.all(list.map(p => withStats(db, p)));
  return c.json(withStatsList);
});

// POST /v1/projects
projects.post("/", requireAuth, async (c) => {
  const { name, description } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: "name is required" }, 400);
  const db = createDbClient(c.env);
  const project = await db.createProject({ name, slug: slugify(name), description, user_id: c.get("userId") });
  await db.logActivity({ user_id: c.get("userId"), project_id: project.id, action: "create", resource: "project", resource_id: project.id });
  c.executionCtx.waitUntil(dispatchWebhook(project.id, "project.created", project, c.env));
  return c.json({ ...project, imageCount: 0, storageUsed: 0 }, 201);
});

// GET /v1/projects/:id
projects.get("/:id", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const project = await db.getProject(c.req.param("id"), c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(await withStats(db, project));
});

// PATCH /v1/projects/:id
projects.patch("/:id", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const existing = await db.getProject(c.req.param("id"), c.get("userId"));
  if (!existing) return c.json({ error: "Project not found" }, 404);
  const { name, description } = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (description !== undefined) updates.description = description;
  const updated = await db.updateProject(c.req.param("id"), updates);
  return c.json(await withStats(db, updated));
});

// DELETE /v1/projects/:id
projects.delete("/:id", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const existing = await db.getProject(c.req.param("id"), c.get("userId"));
  if (!existing) return c.json({ error: "Project not found" }, 404);
  await db.deleteProject(c.req.param("id"));
  await db.logActivity({ user_id: c.get("userId"), action: "delete", resource: "project", resource_id: c.req.param("id") });
  return c.json({ message: "Project deleted" });
});

// GET /v1/projects/:id/stats
projects.get("/:id/stats", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const project = await db.getProject(c.req.param("id"), c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(await db.getImageStats(c.req.param("id")));
});

export default projects;
