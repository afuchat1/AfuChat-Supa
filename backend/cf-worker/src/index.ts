import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type { ExportedHandler } from "@cloudflare/workers-types";
import type { Env } from "./types";

import authRoutes from "./routes/auth";
import projectRoutes from "./routes/projects";
import imageRoutes from "./routes/images";
import apiKeyRoutes from "./routes/apikeys";
import tokenRoutes from "./routes/tokens";
import webhookRoutes from "./routes/webhooks";
import analyticsRoutes from "./routes/analytics";
import activityRoutes from "./routes/activity";
import storageRoutes from "./routes/storage";
import domainRoutes from "./routes/domains";
import storageContainerRoutes from "./routes/storage-containers";
import { proxySupabaseRequest } from "./routes/supabase-gateway";
import appFunctionRoutes from "./routes/app-functions";
import paymentRoutes from "./routes/payments";
import { cleanupExpiredStories } from "./lib/cleanup";

const app = new Hono<{ Bindings: Env }>();

// ── Global middleware ─────────────────────────────────────────────────────────
app.use("*", logger());
app.use("*", secureHeaders());
const allowedOrigins = new Set([
  "https://afuchat.com",
  "https://www.afuchat.com",
]);

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (
        allowedOrigins.has(origin) ||
        origin.endsWith(".afuchat.com") ||
        origin.endsWith(".vercel.app") ||
        origin.endsWith(".replit.dev") ||
        origin.endsWith(".replit.app")
      ) {
        return origin;
      }
      return null;
    },
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    // Supabase JS sends these headers on Auth/PostgREST requests. Without
    // them, browser preflight rejects the request and the client reports the
    // unhelpful "Failed to fetch" message before the worker is reached.
    allowHeaders: ["Content-Type", "Authorization", "apikey", "X-Client-Info"],
    exposeHeaders: ["Content-Range", "X-AfuCloud-Request-Id"],
    maxAge: 86400,
  }),
);

// ── Request ID ────────────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  c.res.headers.set("X-AfuCloud-Request-Id", crypto.randomUUID());
  c.res.headers.set("X-AfuCloud-Version", "v1");
  await next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/", (c) =>
  c.json({
    name: "AfuCloud API",
    status: "ok",
    version: "v1",
    health: "/healthz",
  }),
);

app.get("/healthz", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString(), version: "v1" }),
);

// ── Private Supabase infrastructure gateway ─────────────────────────────────
// The mobile app talks to AfuCloud for Auth, PostgREST, and Realtime. The
// Worker forwards the caller's session to the AfuChat Supabase project so RLS
// remains authoritative while Supabase is removed from the public boundary.
app.all("/auth/v1", proxySupabaseRequest);
app.all("/auth/v1/*", proxySupabaseRequest);
app.all("/rest/v1", proxySupabaseRequest);
app.all("/rest/v1/*", proxySupabaseRequest);
app.all("/realtime/v1", proxySupabaseRequest);
app.all("/realtime/v1/*", proxySupabaseRequest);

// ── API routes ────────────────────────────────────────────────────────────────
app.route("/v1/auth", authRoutes);
app.route("/v1/projects", projectRoutes);
app.route("/v1/analytics", analyticsRoutes);
app.route("/v1/tokens", tokenRoutes);
app.route("/v1/activity", activityRoutes);
app.route("/v1/storage", storageRoutes);
app.route("/v1/domains", domainRoutes);
app.route("/v1/storage-containers", storageContainerRoutes);
app.route("/v1", appFunctionRoutes);
app.route("/v1/payments", paymentRoutes);

// ── Project-scoped sub-routes ─────────────────────────────────────────────────
// Images: /v1/projects/:projectId/images/*
const imageApp = new Hono<{ Bindings: Env }>();
imageApp.route("/:projectId/images", imageRoutes);
app.route("/v1/projects", imageApp);

// API Keys: /v1/projects/:projectId/api-keys/*
const apiKeyApp = new Hono<{ Bindings: Env }>();
apiKeyApp.route("/:projectId/api-keys", apiKeyRoutes);
app.route("/v1/projects", apiKeyApp);

// Webhooks: /v1/projects/:projectId/webhooks/*
const webhookApp = new Hono<{ Bindings: Env }>();
webhookApp.route("/:projectId/webhooks", webhookRoutes);
app.route("/v1/projects", webhookApp);

// Project analytics: /v1/analytics/projects/:projectId
app.route("/v1/analytics", analyticsRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.notFound((c) =>
  c.json(
    {
      error: "Not found",
      path: c.req.path,
      timestamp: new Date().toISOString(),
      api_version: "v1",
    },
    404,
  ),
);

// ── Error handler ─────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("[AfuCloud Worker Error]", err);
  return c.json(
    {
      error: "Internal server error",
      timestamp: new Date().toISOString(),
      api_version: "v1",
    },
    500,
  );
});

const worker: ExportedHandler<Env> = {
  fetch: app.fetch,
  async scheduled(_controller, env, _ctx) {
    try {
      const result = await cleanupExpiredStories(env);
      console.log("[cleanup-expired-stories]", result);
    } catch (error) {
      console.error("[cleanup-expired-stories]", error);
      throw error;
    }
  },
};

export default worker;
