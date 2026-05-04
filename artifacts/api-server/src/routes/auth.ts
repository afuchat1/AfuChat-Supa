import { Router } from "express";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../lib/logger";

const router = Router();

/**
 * POST /api/auth/resolve-identifier
 *
 * Resolves a username (handle) or phone number to the Supabase Auth email
 * so the client can sign in with signInWithPassword({ email, password }).
 *
 * The service-role key is required — only the API server can query auth.users.
 * We intentionally return a generic 404 (not "user not found" vs "wrong type")
 * to avoid leaking user enumeration information.
 */
router.post("/auth/resolve-identifier", async (req, res) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "Service unavailable" });
    }

    const { identifier } = req.body as { identifier?: string };
    if (!identifier || typeof identifier !== "string") {
      return res.status(400).json({ error: "identifier is required" });
    }

    const raw = identifier.trim();
    if (!raw) return res.status(400).json({ error: "identifier is required" });

    // Detect type: phone starts with + or is all digits/spaces/dashes
    const digitsOnly = raw.replace(/[\s\-().]/g, "");
    const isPhone = raw.startsWith("+") || /^\d{7,15}$/.test(digitsOnly);
    const isHandle = !isPhone;

    let userId: string | null = null;

    if (isPhone) {
      // Normalize: ensure leading +, strip non-digit chars after that
      const normalized = raw.startsWith("+") ? raw.replace(/[^\d+]/g, "") : `+${digitsOnly}`;

      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("phone_number", normalized)
        .maybeSingle();

      if (!profile) {
        // Also try without leading + in case stored differently
        const alt = normalized.replace(/^\+/, "");
        const { data: altProfile } = await admin
          .from("profiles")
          .select("id")
          .or(`phone_number.eq.${normalized},phone_number.eq.${alt}`)
          .maybeSingle();
        userId = altProfile?.id ?? null;
      } else {
        userId = profile.id;
      }
    } else {
      // Handle — strip leading @ if present, lowercase
      const handle = raw.replace(/^@/, "").toLowerCase();

      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("handle", handle)
        .maybeSingle();

      userId = profile?.id ?? null;
    }

    if (!userId) {
      return res.status(404).json({ error: "No account found with that identifier" });
    }

    // Fetch the auth user to get their email
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
    if (authErr || !authUser?.user?.email) {
      logger.warn({ userId, authErr }, "resolve-identifier: could not fetch auth user email");
      return res.status(404).json({ error: "No account found with that identifier" });
    }

    return res.json({ email: authUser.user.email });
  } catch (err) {
    logger.error({ err }, "resolve-identifier: unexpected error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
