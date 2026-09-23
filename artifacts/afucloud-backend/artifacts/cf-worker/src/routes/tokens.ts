import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { generateSecureToken, hashToken } from "../lib/auth";
import { dispatchWebhook } from "./webhooks";

const tokens = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function toToken(t: any, secret?: string) {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    prefix: t.prefix,
    scopes: t.scopes ?? [],
    expiresAt: t.expires_at ?? null,
    lastUsedAt: t.last_used_at ?? null,
    revokedAt: t.revoked_at ?? null,
    createdAt: t.created_at,
    ...(secret ? { secret } : {}),
  };
}

// GET /v1/tokens
tokens.get("/", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const list = await db.getPersonalTokens(c.get("userId"));
  return c.json(list.map(t => toToken(t)));
});

// POST /v1/tokens
tokens.post("/", requireAuth, async (c) => {
  const { name, description, scopes = [], expiresAt } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: "name is required" }, 400);
  const db = createDbClient(c.env);
  const rawToken = generateSecureToken();
  const prefix = `afu_pat_${rawToken.slice(4, 12)}`;
  const token_hash = await hashToken(rawToken);
  const token = await db.createPersonalToken({
    user_id: c.get("userId"),
    name,
    description,
    prefix,
    token_hash,
    scopes,
    expires_at: expiresAt ?? null,
  });
  await db.logActivity({ user_id: c.get("userId"), action: "create", resource: "personal_token", resource_id: token.id });
  const projects = await db.getProjects(c.get("userId"));
  c.executionCtx.waitUntil(Promise.all(
    projects.map(project => dispatchWebhook(project.id, "token.created", toToken(token), c.env)),
  ));
  return c.json(toToken(token, rawToken), 201);
});

// DELETE /v1/tokens/:id
tokens.delete("/:id", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const id = c.req.param("id")!;
  await db.revokePersonalToken(id, c.get("userId"));
  await db.logActivity({ user_id: c.get("userId"), action: "revoke", resource: "personal_token", resource_id: id });
  const projects = await db.getProjects(c.get("userId"));
  c.executionCtx.waitUntil(Promise.all(
    projects.map(project => dispatchWebhook(project.id, "token.revoked", { tokenId: id }, c.env)),
  ));
  return c.json({ message: "Token revoked" });
});

export default tokens;
