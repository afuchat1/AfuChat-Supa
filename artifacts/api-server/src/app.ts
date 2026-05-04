import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import publicProfileRouter from "./routes/public-profile";
import publicPostRouter from "./routes/public-post";
import publicVideoRouter from "./routes/public-video";
import landingRouter from "./routes/landing";
import seoRouter from "./routes/seo";
import companyPageRouter from "./routes/company-page";
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

app.use(seoRouter);
app.use(companyPageRouter);
app.use(publicPostRouter);
app.use(publicVideoRouter);
app.use(publicProfileRouter);
app.use(landingRouter);
app.use("/api", router);

// Catch-all JSON 404 for /api/* so the mobile client always receives a
// parseable JSON response (the previous default sent HTML, which caused
// "Invalid response from upload service" errors on the client).
app.use("/api", (req: Request, res: Response) => {
  res
    .status(404)
    .type("application/json")
    .send(JSON.stringify({ error: `No API route for ${req.method} ${req.path}` }));
});

// JSON error handler — must come last. Replaces Express's default HTML
// error page so clients always see a parseable error body, even when an
// upload exceeds the size limit or a route throws unexpectedly.
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  const payload = {
    error: err?.message || "Internal server error",
    code: err?.code || undefined,
  };
  try {
    (req as any).log?.error({ err, url: req.url }, "request failed");
  } catch {
    /* logger may not be attached for very early errors */
  }
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).type("application/json").send(JSON.stringify(payload));
});

export default app;
