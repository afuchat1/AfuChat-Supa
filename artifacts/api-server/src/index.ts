import app from "./app";
import { logger } from "./lib/logger";
import { startRealtimeWatcher } from "./services/realtimeWatcher";
import { startVideoEncoder } from "./services/videoEncoder";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start background Supabase realtime watcher for email notifications
  startRealtimeWatcher();

  // Start the video encoding worker (no-op if SUPABASE_SERVICE_ROLE_KEY
  // is missing or VIDEO_WORKER_ENABLED=false).
  startVideoEncoder().catch((err) =>
    logger.error({ err }, "failed to start video encoder"),
  );
});
