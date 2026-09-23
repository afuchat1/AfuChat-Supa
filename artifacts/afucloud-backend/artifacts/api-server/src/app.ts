import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Keep unexpected route failures from becoming Express's HTML error page.
// Clients always receive a stable JSON response, while the server log keeps
// the diagnostic details for debugging.
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  logger.error({
    operation: "http.request",
    method: req.method,
    path: req.path,
    error: error instanceof Error ? error.message : String(error),
  }, "Unhandled API error");

  res.status(500).json({ error: "Internal server error" });
});

export default app;
