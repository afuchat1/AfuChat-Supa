/**
 * crashReporter.ts
 *
 * Captures unhandled JS errors, unhandled promise rejections, and React render
 * errors from the ErrorBoundary, then ships them to Supabase `crash_logs`.
 *
 * Design principles:
 *  - Zero dependencies on React (safe to call before any component mounts).
 *  - Never throws — every path is wrapped in try/catch.
 *  - No-ops in Expo Go and web (where native stack traces don't exist).
 *  - Deduplicates identical errors within a 10-second window.
 *  - Queues up to 10 reports in AsyncStorage if offline; flushes on next init.
 *  - Marks dev builds with `is_dev: true` so dashboards can filter them.
 *
 * Usage (already done in _layout.tsx):
 *   import "@/lib/crashReporter";   // Global handlers initialize on import.
 *
 * Auth integration (done via CrashReporterUserSync component in _layout.tsx):
 *   setCrashReporterUserId(user?.id ?? null);
 */

import { Platform } from "react-native";
import { getStorageDiagnostics } from "./storage/mmkv";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CrashErrorType =
  | "js_error"            // Global unhandled JS exception
  | "unhandled_rejection" // Unhandled promise rejection
  | "react_render"        // Caught by React ErrorBoundary
  | "native_bridge";      // Re-thrown native exception captured in JS

export interface CrashReport {
  error_type: CrashErrorType;
  error_message: string;
  stack_trace?: string;
  component_stack?: string;
  extra?: Record<string, unknown>;
}

// ─── Module state ──────────────────────────────────────────────────────────────

let _initialized         = false;
let _userId: string | null = null;
let _isStandalone        = false;
let _queueFlushScheduled = false;
let _appOperational      = false;
const _startupStartedAt  = Date.now();
let _startupPhase: StartupPhase = "critical";
const _startupMilestones: Array<{ phase: StartupPhase; elapsed_ms: number }> = [
  { phase: "critical", elapsed_ms: 0 },
];

export type StartupPhase =
  | "critical"
  | "primary"
  | "auth_restoration"
  | "operational"
  | "deferred";

/**
 * Optional callback set by the UI layer to notify the user when a crash is
 * captured. Receives the error message so it can be pre-filled as a support
 * ticket subject. Called at most once per deduplicated error.
 */
let _crashNotificationHandler: ((errorMessage: string) => void) | null = null;

/** Hash → timestamp of last send. Prevents flooding from repeat errors. */
const _recentHashes = new Map<string, number>();
const DEDUP_WINDOW_MS  = 10_000;
const QUEUE_KEY        = "afuchat:crash_queue_v1";
const CRASH_LOG_KEY    = "afuchat_last_crash_log";
const PREV_CRASH_KEY   = "afuchat_prev_crash_log";
const MAX_QUEUE        = 10;

// ─── Public API ────────────────────────────────────────────────────────────────

/** Wire up global error handlers. Call once at app start (module-eval is fine). */
export function initCrashReporter(): void {
  if (_initialized) return;

  _isStandalone = _checkIsStandalone();
  if (!_isStandalone) return;        // No-op in Expo Go and web.

  _initialized = true;

  // ── Global JS error handler ───────────────────────────────────────────────
  const prevHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
  (global as any).ErrorUtils?.setGlobalHandler?.((error: Error, isFatal: boolean) => {
    _enqueue({
      error_type: "js_error",
      error_message: error?.message ?? String(error),
      stack_trace: error?.stack,
      extra: { is_fatal: isFatal },
    });
    // Always forward to the previous handler so the default RN red-box / crash
    // dialog still appears during development.
    if (typeof prevHandler === "function") prevHandler(error, isFatal);
  });

  // ── Unhandled promise rejections ──────────────────────────────────────────
  const prevRejection = (global as any).onunhandledrejection;
  (global as any).onunhandledrejection = (event: PromiseRejectionEvent) => {
    const err = event?.reason;
    _enqueue({
      error_type: "unhandled_rejection",
      error_message: err instanceof Error ? err.message : String(err ?? "Unknown rejection"),
      stack_trace: err instanceof Error ? err.stack : undefined,
    });
    if (typeof prevRejection === "function") prevRejection(event);
  };

}

/**
 * Flush persisted reports only after the root UI has mounted. The delayed,
 * fire-and-forget work cannot hold up first render or native startup.
 */
function scheduleQueuedCrashReportFlush(): void {
  if (!_initialized || !_isStandalone || !_appOperational || _queueFlushScheduled) return;
  _queueFlushScheduled = true;
  setTimeout(() => {
    _queueFlushScheduled = false;
    markStartupPhase("deferred");
    void _flushQueue();
  }, 6000);
}

/** Record startup progress without blocking rendering or touching native modules. */
export function markStartupPhase(phase: StartupPhase): void {
  if (_appOperational && phase !== "deferred") return;
  _startupPhase = phase;
  _startupMilestones.push({
    phase,
    elapsed_ms: Math.max(0, Date.now() - _startupStartedAt),
  });
  if (_startupMilestones.length > 8) _startupMilestones.shift();

  if (phase === "operational") {
    _appOperational = true;
    scheduleQueuedCrashReportFlush();
  }
}

/** Call whenever auth state changes (user login / logout). */
export function setCrashReporterUserId(id: string | null): void {
  _userId = id;
}

/**
 * Register a handler that is called whenever a crash is captured (after dedup).
 * The handler receives the human-readable error message so the UI can offer the
 * user options to report it via email or an in-app support ticket.
 * Pass null to clear the handler.
 */
export function setCrashNotificationHandler(
  handler: ((errorMessage: string) => void) | null,
): void {
  _crashNotificationHandler = handler;
}

/**
 * Report an error explicitly (e.g. from ErrorBoundary.componentDidCatch).
 * Safe to call even if initCrashReporter() was never called.
 */
export function reportCrash(report: CrashReport): void {
  if (!_isStandalone) return;
  _enqueue(report);
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function _checkIsStandalone(): boolean {
  if (Platform.OS === "web") return false;
  try {
    const Constants = require("expo-constants").default;
    const env = Constants?.executionEnvironment;
    const own = Constants?.appOwnership;
    if (env === "storeClient" || own === "expo") return false;
    // "standalone" | "bare" | "storeClient"
  } catch {}
  return true;
}

function _errorHash(msg: string, type: string): string {
  // Cheap 32-bit djb2 hash — good enough for dedup.
  const s = type + msg;
  let h = 5381;
  for (let i = 0; i < Math.min(s.length, 512); i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}

function _isDuplicate(hash: string): boolean {
  const last = _recentHashes.get(hash);
  if (last !== undefined && Date.now() - last < DEDUP_WINDOW_MS) return true;
  _recentHashes.set(hash, Date.now());
  // Evict old entries to prevent unbounded growth.
  if (_recentHashes.size > 50) {
    const oldest = _recentHashes.keys().next().value;
    if (oldest !== undefined) _recentHashes.delete(oldest);
  }
  return false;
}

async function _enqueue(report: CrashReport): Promise<void> {
  try {
    const hash = _errorHash(report.error_message, report.error_type);
    if (_isDuplicate(hash)) return;

    const payload = _buildPayload(report);
    void _persistGlobalCrashLog(report, payload);

    // Notify the UI so the user can choose to send a support report.
    if (_crashNotificationHandler && report.error_message) {
      try { _crashNotificationHandler(safeCrashSummary(report.error_message)); } catch {}
    }

    // Startup errors are persisted locally first. Never attempt network I/O
    // until navigation has rendered and the app has entered its operational phase.
    if (!_appOperational) {
      await _addToQueue(payload);
      return;
    }

    const sent = await _send(payload);
    if (!sent) await _addToQueue(payload);
  } catch {}
}

export function redactCrashText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"'`]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|token|password|secret|authorization)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /([?&](?:access_token|refresh_token|token|password|secret)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");
}

export function safeCrashSummary(message: string): string {
  const errorName = /(?:^|\b)([A-Za-z_$][\w$]*Error)\b/.exec(message)?.[1];
  return `Error details redacted${errorName ? ` (${errorName})` : ""}`;
}

function _sanitizeExtra(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactCrashText(value).slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => _sanitizeExtra(item, depth + 1));
  if (typeof value !== "object") return undefined;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    if (/(token|password|secret|authorization|message|content|body)/i.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = _sanitizeExtra(item, depth + 1);
    }
  }
  return result;
}

function _buildPayload(report: CrashReport): Record<string, unknown> {
  let appVersion = "unknown";
  let buildNumber = "unknown";
  let deviceInfo: Record<string, unknown> = {};

  try {
    const Constants = require("expo-constants").default;
    appVersion  = Constants?.expoConfig?.version ?? Constants?.manifest?.version ?? "unknown";
    buildNumber = String(
      Constants?.expoConfig?.ios?.buildNumber ??
      Constants?.expoConfig?.android?.versionCode ??
      "unknown"
    );
  } catch {}

  try {
    const { Dimensions } = require("react-native");
    const { width, height } = Dimensions.get("screen");
    deviceInfo = { screen_width: width, screen_height: height };
  } catch {}

  try {
    const DeviceInfo = require("expo-device");
    deviceInfo = {
      ...deviceInfo,
      device_name: DeviceInfo.deviceName,
      model_name: DeviceInfo.modelName,
      os_version:  DeviceInfo.osVersion,
      brand:       DeviceInfo.brand,
    };
  } catch {}

  const storageDiagnostics = getStorageDiagnostics();
  const sanitizedExtra = _sanitizeExtra(report.extra);
  const extra =
    sanitizedExtra && typeof sanitizedExtra === "object" && !Array.isArray(sanitizedExtra)
      ? (sanitizedExtra as Record<string, unknown>)
      : {};
  return {
    error_type:      report.error_type,
    // Do not upload arbitrary exception text: native/network errors can echo
    // credentials or private user content. The type and stack remain useful.
    error_message:   `${report.error_type}: ${safeCrashSummary(report.error_message)}`,
    stack_trace:     report.stack_trace ? redactCrashText(report.stack_trace).slice(0, 8000) : undefined,
    component_stack: report.component_stack ? redactCrashText(report.component_stack).slice(0, 4000) : undefined,
    platform:        Platform.OS,
    app_version:     appVersion,
    build_number:    buildNumber,
    user_id:         _userId ?? null,
    device_info:     deviceInfo,
    is_dev:          __DEV__,
    extra: {
      ...extra,
      startup: {
        phase: _startupPhase,
        elapsed_ms: Math.max(0, Date.now() - _startupStartedAt),
        milestones: _startupMilestones.map((milestone) => ({ ...milestone })),
        native: {
          platform_version: String(Platform.Version),
          storage_backend: storageDiagnostics.backend,
          persistent_storage_init_failed: storageDiagnostics.persistentStoreInitFailed,
        },
      },
    },
  };
}

async function _persistGlobalCrashLog(
  report: CrashReport,
  payload: Record<string, unknown>,
): Promise<void> {
  if (report.error_type === "react_render") return;
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const previous = await AsyncStorage.getItem(CRASH_LOG_KEY);
    if (previous) await AsyncStorage.setItem(PREV_CRASH_KEY, previous);
    const extra = payload.extra as Record<string, any> | null;
    const startup = extra?.startup;
    const log = [
      "AfuChat Global Crash Report",
      `Time: ${new Date().toISOString()}`,
      `Type: ${report.error_type}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Startup phase: ${startup?.phase ?? "unknown"}`,
      `Startup elapsed: ${startup?.elapsed_ms ?? "unknown"}ms`,
      `Native storage: ${startup?.native?.storage_backend ?? "unknown"}`,
      "",
      String(payload.error_message ?? "Error details redacted"),
      "",
      "Stack trace:",
      String(payload.stack_trace ?? "(no stack trace)"),
    ].join("\n");
    await AsyncStorage.setItem(CRASH_LOG_KEY, log);
  } catch {}
}

async function _send(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const { supabase } = require("@/lib/supabase");
    const { error } = await supabase.from("crash_logs").insert(payload);
    return !error;
  } catch {
    return false;
  }
}

async function _addToQueue(payload: Record<string, unknown>): Promise<void> {
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: Record<string, unknown>[] = raw ? JSON.parse(raw) : [];
    queue.push({ ...payload, queued_at: Date.now() });
    // Cap queue size — drop oldest if full.
    const capped = queue.slice(-MAX_QUEUE);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(capped));
  } catch {}
}

async function _flushQueue(): Promise<void> {
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const queue: Record<string, unknown>[] = JSON.parse(raw);
    if (!queue.length) return;

    // Try to send each queued item; keep failures for next time.
    const failed: Record<string, unknown>[] = [];
    for (const payload of queue) {
      const sent = await _send(payload);
      if (!sent) failed.push(payload);
    }

    if (failed.length) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
    } else {
      await AsyncStorage.removeItem(QUEUE_KEY);
    }
  } catch {}
}

// Install the single global handler owner before the root layout and its
// remaining imports begin application startup.
initCrashReporter();
