import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { generateSecureToken, hashToken } from "../lib/auth";

const apikeys = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function toApiKey(k: any, secret?: string) {
  return {
    id: k.id,
    projectId: k.project_id,
    name: k.name,
    environment: k.environment,
    prefix: k.prefix,
    scopes: k.scopes ?? [],
    lastUsedAt: k.last_used_at ?? null,
    createdAt: k.created_at,
    ...(secret ? { secret } : {}),
  };
}

// GET /v1/projects/:projectId/api-keys
apikeys.get("/", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  const project = await db.getProject(projectId, c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const keys = await db.getApiKeys(projectId);
  return c.json(keys.map(k => toApiKey(k)));
});

// POST /v1/projects/:projectId/api-keys
apikeys.post("/", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const db = createDbClient(c.env);
  const project = await db.getProject(projectId, c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  const { name, environment = "development", scopes = [] } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: "name is required" }, 400);
  const rawKey = generateSecureToken();
  const envShort = environment === "production" ? "prod" : environment === "testing" ? "test" : "dev";
  const prefix = `afu_${envShort}_${rawKey.slice(4, 12)}`;
  const key_hash = await hashToken(rawKey);
  const key = await db.createApiKey({ project_id: projectId, name, environment, prefix, key_hash, scopes });
  await db.logActivity({ user_id: c.get("userId"), project_id: projectId, action: "create", resource: "api_key", resource_id: key.id });
  return c.json(toApiKey(key, rawKey), 201);
});

// DELETE /v1/projects/:projectId/api-keys/:keyId
apikeys.delete("/:keyId", requireAuth, async (c) => {
  const projectId = c.req.param("projectId")!;
  const keyId = c.req.param("keyId")!;
  const db = createDbClient(c.env);
  const project = await db.getProject(projectId, c.get("userId"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  await db.revokeApiKey(keyId, projectId);
  await db.logActivity({ user_id: c.get("userId"), project_id: projectId, action: "revoke", resource: "api_key", resource_id: keyId });
  return c.json({ message: "API key revoked" });
});

export default apikeys;
