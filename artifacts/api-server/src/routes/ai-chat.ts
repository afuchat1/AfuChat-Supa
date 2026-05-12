/**
 * AI chat — NOT handled by the Express server.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALL AI FEATURES LIVE IN SUPABASE EDGE FUNCTIONS — DO NOT MOVE THEM.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * The mobile client calls Supabase Edge Functions directly for every AI
 * feature.  This file is intentionally an empty router so the import in
 * routes/index.ts continues to compile.  Do not add AI logic here.
 *
 * Edge functions (supabase/functions/):
 *   afu-ai-reply      — text chat (all in-app AI conversations)
 *   ai-chat           — legacy alias for afu-ai-reply
 *   transcribe-audio  — voice message transcription
 *   generate-ai-image — AI image generation (premium)
 *
 * AI keys (GROQ_API_KEY, OPENAI_API_KEY, etc.) are stored as secrets in the
 * Supabase Dashboard under Project → Edge Functions → Secrets.  They must
 * NEVER be added to the Express server or Replit environment variables.
 *
 * See replit.md → "AI Architecture" for the full rationale and how to update
 * the models or providers in the edge functions.
 */

import { Router } from "express";

const router = Router();

export default router;
