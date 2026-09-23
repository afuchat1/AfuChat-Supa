import { createMiddleware } from "hono/factory";
import type { Env, AuthVariables } from "../types";
import { verifyAccessToken, extractBearerToken } from "../lib/auth";

export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const token = extractBearerToken(c.req.header("Authorization") ?? null);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = await verifyAccessToken(token, c.env);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  c.set("userId", payload.userId);
  c.set("email", payload.email);
  await next();
});
