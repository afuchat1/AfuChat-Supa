import app from "./app";
import { logger } from "./lib/logger";
import { configureBucketCors } from "./lib/storage";

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

  // Configure R2 bucket CORS so browsers can PUT directly via pre-signed URLs.
  configureBucketCors()
    .then(() => logger.info("R2 bucket CORS configured"))
    .catch((e) => logger.warn({ err: e }, "R2 CORS setup skipped or failed — uploads may be blocked by CORS"));
});
