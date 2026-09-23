import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { generateDownloadUrl, getPublicUrl } from "../lib/storage";

const storage = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /v1/storage/:key — redirect to the canonical AfuCloud CDN when configured.
// Falls back to a short-lived signed R2 URL if no CDN is configured.
// Public endpoint: the key itself is the access control (opaque storage keys).
storage.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  try {
    const url = c.env.R2_PUBLIC_URL
      ? getPublicUrl(key, c.env)
      : await generateDownloadUrl(key, c.env, 3600);
    return c.redirect(url, 302);
  } catch {
    return c.json({ error: "Object not found" }, 404);
  }
});

export default storage;
