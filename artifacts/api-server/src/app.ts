import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import publicProfileRouter from "./routes/public-profile";
import publicPostRouter from "./routes/public-post";
import landingRouter from "./routes/landing";
import seoRouter from "./routes/seo";
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
app.use(publicPostRouter);
app.use(publicProfileRouter);
app.use(landingRouter);
app.use("/api", router);

export default app;
