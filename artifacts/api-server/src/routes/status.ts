import { Router, type Request, type Response } from "express";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { SUPABASE_URL } from "../lib/constants";

const SUPABASE_ANON_KEY = process.env["SUPABASE_ANON_KEY"] || process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] || "";

const router = Router();

type ServiceStatus = "operational" | "degraded" | "outage";

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latency_ms?: number;
  message?: string;
}

interface StatusResponse {
  overall: ServiceStatus;
  checked_at: string;
  services: ServiceCheck[];
}

async function checkSupabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return {
        name: "Database",
        status: "degraded",
        message: "Service role key not configured — read-only mode",
      };
    }
    const { error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) {
      return {
        name: "Database",
        status: "outage",
        latency_ms: Date.now() - start,
        message: error.message,
      };
    }
    return { name: "Database", status: "operational", latency_ms: Date.now() - start };
  } catch (e: any) {
    return {
      name: "Database",
      status: "outage",
      latency_ms: Date.now() - start,
      message: e?.message || "Connection failed",
    };
  }
}

async function checkAuth(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { name: "Authentication", status: "outage", message: "Supabase credentials not configured" };
    }
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
    });
    return {
      name: "Authentication",
      status: res.ok ? "operational" : "degraded",
      latency_ms: Date.now() - start,
      message: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      name: "Authentication",
      status: "outage",
      latency_ms: Date.now() - start,
      message: e?.message || "Unreachable",
    };
  }
}

async function checkStorage(): Promise<ServiceCheck> {
  const r2Url = process.env["R2_PUBLIC_BASE_URL"] || process.env["R2_DEV_PUBLIC_URL"];
  const configured =
    !!process.env["CLOUDFLARE_ACCOUNT_ID"] &&
    !!process.env["CLOUDFLARE_R2_ACCESS_KEY_ID"] &&
    !!process.env["R2_BUCKET"];
  if (!configured) {
    return { name: "File Storage", status: "degraded", message: "R2 storage not configured — uploads unavailable" };
  }
  if (!r2Url) {
    return { name: "File Storage", status: "degraded", message: "Storage configured but public URL missing" };
  }
  const start = Date.now();
  try {
    const res = await fetch(r2Url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    return {
      name: "File Storage",
      status: res.status < 500 ? "operational" : "degraded",
      latency_ms: Date.now() - start,
    };
  } catch {
    return { name: "File Storage", status: "operational", latency_ms: Date.now() - start };
  }
}

function checkVideoProcessing(): ServiceCheck {
  const hasKey = !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const workerDisabled = process.env["VIDEO_WORKER_ENABLED"] === "false";
  if (!hasKey || workerDisabled) {
    return {
      name: "Video Processing",
      status: "degraded",
      message: hasKey ? "Video worker disabled" : "Service role key not configured",
    };
  }
  return { name: "Video Processing", status: "operational" };
}

function checkPayments(): ServiceCheck {
  const configured =
    !!process.env["PESAPAL_CONSUMER_KEY"] && !!process.env["PESAPAL_CONSUMER_SECRET"];
  return {
    name: "Payments",
    status: configured ? "operational" : "degraded",
    message: configured ? undefined : "Payment gateway not configured",
  };
}

function checkNotifications(): ServiceCheck {
  return { name: "Push Notifications", status: "operational" };
}

function overallStatus(services: ServiceCheck[]): ServiceStatus {
  if (services.some((s) => s.status === "outage")) return "outage";
  if (services.some((s) => s.status === "degraded")) return "degraded";
  return "operational";
}

router.get("/status", async (_req: Request, res: Response) => {
  const [db, auth, storage] = await Promise.all([
    checkSupabase(),
    checkAuth(),
    checkStorage(),
  ]);

  const services: ServiceCheck[] = [
    db,
    auth,
    storage,
    checkVideoProcessing(),
    checkPayments(),
    checkNotifications(),
  ];

  const body: StatusResponse = {
    overall: overallStatus(services),
    checked_at: new Date().toISOString(),
    services,
  };

  const httpStatus = body.overall === "outage" ? 503 : 200;
  res.status(httpStatus).json(body);
});

export default router;
