/**
 * Storage serving route.
 * GET /v1/storage/:key — generates a pre-signed R2 GET URL and redirects.
 * The key is URL-encoded (encodeURIComponent) so slashes are %2F and fit a
 * single `:key` parameter.
 */
import express, { Router, type IRouter } from "express";
import {
  generateSignedGetUrl,
  generateSignedDownloadUrl,
  hasCredentials,
  putDevObject,
  readDevObject,
} from "../lib/storage";

const router: IRouter = Router();

// Development-only upload target used when R2 credentials are intentionally
// absent. Production uses a signed R2 URL and never reaches this handler.
router.put(
  "/v1/storage/dev-upload/:key",
  express.raw({ type: "*/*", limit: "100mb" }),
  async (req, res): Promise<void> => {
    if (hasCredentials()) {
      res.status(404).json({ error: "Development storage is disabled" });
      return;
    }

    const key = req.params.key as string;
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    if (!key || !body) {
      res.status(400).json({ error: "A storage key and binary body are required" });
      return;
    }

    try {
      await putDevObject(key, body);
      res.status(200).json({ ok: true });
    } catch {
      res.status(400).json({ error: "Invalid storage key" });
    }
  },
);

router.get("/v1/storage/:key", async (req, res): Promise<void> => {
  const rawKey = req.params.key as string;
  if (!rawKey) {
    res.status(400).json({ error: "Missing storage key" });
    return;
  }

  // The key was encoded with encodeURIComponent; Express auto-decodes params.
  const key = rawKey;

  try {
    if (!hasCredentials()) {
      const object = await readDevObject(key);
      if (!object) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      res.type(key.split(".").pop() || "bin");
      res.setHeader("Cache-Control", req.query.download === "1" ? "private, no-cache" : "no-cache");
      if (req.query.download === "1") {
        const filename = String(req.query.filename ?? "afuchat-download").replace(/["\\\r\n]/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      }
      res.send(object);
      return;
    }

    const signedUrl = req.query.download === "1"
      ? await generateSignedDownloadUrl(key, String(req.query.filename ?? "afuchat-download"), 3600)
      : await generateSignedGetUrl(key, 3600);
    // 302 redirect — browser follows it to load the image directly from R2.
    // Cache-Control lets browsers reuse the redirect for up to 5 minutes.
    res.setHeader("Cache-Control", "private, max-age=300");
    res.redirect(302, signedUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate signed URL";
    res.status(500).json({ error: message });
  }
});

export default router;
