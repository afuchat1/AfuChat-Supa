import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../lib/logger";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function cleanupExpiredStories(): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  try {
    const now = new Date().toISOString();

    const { data: expiredStories, error: fetchErr } = await admin
      .from("stories")
      .select("id")
      .lt("expires_at", now);

    if (fetchErr) {
      logger.error({ err: fetchErr }, "[stories-cleanup] Failed to fetch expired stories");
      return;
    }

    if (!expiredStories || expiredStories.length === 0) {
      logger.debug("[stories-cleanup] No expired stories to delete");
      return;
    }

    const ids = expiredStories.map((s: any) => s.id as string);

    // Delete related rows first (handles tables without ON DELETE CASCADE)
    await admin.from("story_replies").delete().in("story_id", ids);
    await admin.from("story_views").delete().in("story_id", ids);

    const { error: delErr } = await admin
      .from("stories")
      .delete()
      .in("id", ids);

    if (delErr) {
      logger.error({ err: delErr }, "[stories-cleanup] Error deleting expired stories");
    } else {
      logger.info({ count: ids.length }, "[stories-cleanup] Deleted expired stories");
    }
  } catch (err) {
    logger.error({ err }, "[stories-cleanup] Unexpected error during cleanup");
  }
}

export function startStoriesCleanup(): void {
  cleanupExpiredStories().catch((err) =>
    logger.error({ err }, "[stories-cleanup] Startup cleanup failed"),
  );

  setInterval(() => {
    cleanupExpiredStories().catch((err) =>
      logger.error({ err }, "[stories-cleanup] Periodic cleanup failed"),
    );
  }, CLEANUP_INTERVAL_MS);

  logger.info("[stories-cleanup] Scheduled hourly expired-story cleanup");
}
