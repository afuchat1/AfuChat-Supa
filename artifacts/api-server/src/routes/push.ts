/**
 * Push notification routes.
 *
 * POST /api/push/register-token   — save a device's Expo push token
 * POST /api/push/send             — send a push from an authenticated client
 *
 * Both routes require a valid Supabase JWT in Authorization: Bearer <token>.
 */

import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { sendPush, savePushToken } from "../lib/push";
import { SUPABASE_URL } from "../lib/constants";

const router = Router();

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

async function verifyJwt(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice(7);
  const client = createClient(SUPABASE_URL, supabaseAnonKey);
  const { data: { user }, error } = await client.auth.getUser(jwt);
  if (error || !user) return null;
  return user.id;
}

// ── POST /api/push/register-token ─────────────────────────────────────────
router.post("/push/register-token", async (req: Request, res: Response) => {
  try {
    const userId = await verifyJwt(req.headers.authorization);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { token } = req.body as { token?: string };
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "token is required" });
      return;
    }

    await savePushToken(userId, token);
    logger.info({ userId }, "[push-route] Token registered");
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err }, "[push-route] register-token failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/push/send ───────────────────────────────────────────────────
// Mobile clients call this when they want to dispatch a push to another user
// (e.g. after sending a message, liking a post, etc.).  The server looks up
// the recipient's push token with the service role key so we don't expose it
// to the caller, and so RLS restrictions are bypassed reliably.
router.post("/push/send", async (req: Request, res: Response) => {
  try {
    const callerId = await verifyJwt(req.headers.authorization);
    if (!callerId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { userId, title, body, data, categoryIdentifier } = req.body as {
      userId?: string;
      title?: string;
      body?: string;
      data?: Record<string, string>;
      categoryIdentifier?: string;
    };

    if (!userId || !title || !body) {
      res.status(400).json({ error: "userId, title, and body are required" });
      return;
    }

    // Callers cannot send pushes to themselves (anti-spam guard)
    if (userId === callerId) {
      res.status(400).json({ error: "Cannot send push to yourself" });
      return;
    }

    const ok = await sendPush({ userId, title, body, data, categoryIdentifier });
    res.json({ ok });
  } catch (err: any) {
    logger.error({ err }, "[push-route] send failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
