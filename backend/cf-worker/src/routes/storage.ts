import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { generateDownloadUrl } from "../lib/storage";

const storage = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /v1/storage/:key — redirect to a pre-signed download URL
// Public endpoint: the key itself is the access control (opaque storage keys)
storage.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  try {
    const url = await generateDownloadUrl(key, c.env, 3600);
    return c.redirect(url, 302);
  } catch {
    return c.json({ error: "Object not found" }, 404);
  }
});

export default storage;
