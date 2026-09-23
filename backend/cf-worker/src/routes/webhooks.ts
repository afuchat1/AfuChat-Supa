import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { requireAuth } from "../middleware/auth";

const webhooks = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /v1/projects/:projectId/webhooks
webhooks.get("/", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  const project = await db.getProject(projectId, c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const list = await db.getWebhooks(projectId);
  return c.json(list.map((w: any) => ({ ...w, secret: undefined })));
});

// POST /v1/projects/:projectId/webhooks
webhooks.post("/", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  const project = await db.getProject(projectId, c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const { url, events = [], secret, active = true } = await c.req.json().catch(() => ({}));
  if (!url) return c.json({ error: "url is required" }, 400);
  const wh = await db.createWebhook({ project_id: projectId, url, events, secret, active });
  await db.logActivity({ user_id: c.get("userId"), project_id: projectId, action: "create", resource: "webhook", resource_id: wh.id });
  return c.json({ ...wh, secret: undefined }, 201);
});

// PATCH /v1/projects/:projectId/webhooks/:whId
webhooks.patch("/:whId", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const whId = c.req.param("whId")!;
  const db = createDbClient(c.env);
  const project = await db.getProject(projectId, c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.url != null) updates.url = body.url;
  if (body.events != null) updates.events = body.events;
  if (body.active != null) updates.active = body.active;
  if (body.secret != null) updates.secret = body.secret;
  const wh = await db.updateWebhook(whId, projectId, updates);
  return c.json({ ...wh, secret: undefined });
});

// DELETE /v1/projects/:projectId/webhooks/:whId
webhooks.delete("/:whId", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const whId = c.req.param("whId")!;
  const db = createDbClient(c.env);
  const project = await db.getProject(projectId, c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  await db.deleteWebhook(whId, projectId);
  return c.json({ message: "Webhook deleted" });
});

// Helper: dispatch a webhook event (call from other routes after mutations)
export async function dispatchWebhook(
  projectId: string,
  event: string,
  data: unknown,
  env: Env,
): Promise<void> {
  const db = createDbClient(env);
  const whs = await db.getWebhooks(projectId);
  const active = whs.filter((w: any) => w.active && w.events?.includes(event));

  await Promise.allSettled(
    active.map(async (wh: any) => {
      const payload = JSON.stringify({ event, projectId, data, timestamp: new Date().toISOString() });
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (wh.secret) {
        const key = await crypto.subtle.importKey(
          "raw", new TextEncoder().encode(wh.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
        );
        const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
        headers["X-AfuCloud-Signature"] = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
      }
      for (let i = 0; i < 3; i++) {
        try {
          const r = await fetch(wh.url, { method: "POST", headers, body: payload });
          if (r.ok) break;
        } catch {
          if (i === 2) break;
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
      }
    }),
  );
}

export default webhooks;
