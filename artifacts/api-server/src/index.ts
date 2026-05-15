import app from "./app";
import { logger } from "./lib/logger";
import { loadAppSettings } from "./lib/bootstrap";
import { startRealtimeWatcher } from "./services/realtimeWatcher";
import { startPushWatcher } from "./services/pushWatcher";
import { startVideoEncoder } from "./services/videoEncoder";
import { startStoriesCleanup } from "./services/storiesCleanup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Bootstrap runtime settings from Supabase before listening so that
// modules like r2.ts see the right env vars when they're first used.
await loadAppSettings();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start background Supabase realtime watcher for email notifications
  startRealtimeWatcher();

  // Start server-side push notification watcher — dispatches Expo pushes
  // from the always-running server so they fire even when the sender's app
  // is closed. Watches messages, calls, and notifications tables.
  startPushWatcher();

  // Start the video encoding worker (no-op if SUPABASE_SERVICE_ROLE_KEY
  // is missing or VIDEO_WORKER_ENABLED=false).
  startVideoEncoder().catch((err) =>
    logger.error({ err }, "failed to start video encoder"),
  );

  // Purge expired stories at startup then every hour
  startStoriesCleanup();
});
