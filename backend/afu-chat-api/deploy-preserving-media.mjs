#!/usr/bin/env node
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ACCOUNT_ID = "42e79186125e8ff83e51f15816e074de";
const WORKER_NAME = "afuchat-api";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const WORKER_ROOT = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const token = process.env.CLOUDFLARE_API_KEY?.trim();

if (!token) {
  throw new Error("CLOUDFLARE_API_KEY is required.");
}

const apiHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
};

function apiPath(pathname) {
  return `${CLOUDFLARE_API}/accounts/${ACCOUNT_ID}/workers/scripts${pathname}`;
}

function safeErrorCodes(data) {
  return Array.isArray(data?.errors)
    ? data.errors.map((item) => item.code).filter((code) => code !== undefined)
    : [];
}

async function readApiResponse(response, label) {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const codes = safeErrorCodes(data);
    throw new Error(
      `${label} failed with HTTP ${response.status}` +
        (codes.length ? ` (Cloudflare codes: ${codes.join(", ")})` : ""),
    );
  }
  return data;
}

async function getJson(pathname, label) {
  const response = await fetch(apiPath(pathname), { headers: apiHeaders });
  return readApiResponse(response, label);
}

async function uploadBundle(metadata, modules, label) {
  const form = new FormData();
  form.set(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    "metadata.json",
  );
  for (const [name, content] of Object.entries(modules)) {
    form.set(name, new Blob([content], { type: "application/javascript+module" }), name);
  }

  const response = await fetch(apiPath(`/${WORKER_NAME}`), {
    method: "PUT",
    headers: { Authorization: apiHeaders.Authorization },
    body: form,
  });
  const result = await readApiResponse(response, label);
  if (result.success !== true) {
    throw new Error(`${label} was not confirmed by Cloudflare.`);
  }
}

function extractModule(buffer, contentType, moduleName) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (boundaryMatch?.[1] || boundaryMatch?.[2] || "").trim();
  if (!boundary) throw new Error("Cloudflare did not return a multipart Worker bundle.");

  const parts = buffer.toString("utf8").split(`--${boundary}`);
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd);
    const fieldName = headers.match(/name="([^"]+)"/i)?.[1];
    if (fieldName !== moduleName) continue;
    return part.slice(headerEnd + 4).replace(/\r\n$/, "");
  }
  throw new Error(`The deployed Worker bundle has no ${moduleName} module.`);
}

async function getCurrentWorkerSource() {
  const response = await fetch(apiPath(`/${WORKER_NAME}`), { headers: apiHeaders });
  if (!response.ok) {
    await response.arrayBuffer();
    throw new Error(`Could not read the current ${WORKER_NAME} Worker (HTTP ${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  return extractModule(buffer, contentType, "index.js");
}

async function assertProductionMediaPreflight() {
  const chat = await fetch("https://api.afuchat.com/v1/chat/healthz");
  const chatBody = await chat.text();
  if (chat.status !== 404 || !chatBody.includes("Route not found")) {
    throw new Error("The existing chat route does not match the expected legacy Worker response; deployment stopped.");
  }

  const media = await fetch("https://cdn.afuchat.com/chat/__deployment_probe__");
  const mediaBody = await media.text();
  if (media.status !== 400 || !mediaBody.includes("Invalid storage key")) {
    throw new Error("The existing CDN media route does not match the expected Worker response; deployment stopped.");
  }
}

async function assertProductionMediaPostflight() {
  const health = await fetch("https://api.afuchat.com/v1/chat/healthz");
  const healthBody = await health.json().catch(() => null);
  if (health.status !== 200 || healthBody?.worker !== WORKER_NAME || healthBody?.status !== "ok") {
    throw new Error(
      `Chat health check failed (HTTP ${health.status}, worker ${healthBody?.worker ?? "unknown"}).`,
    );
  }

  const options = await fetch("https://api.afuchat.com/v1/chat/conversations", {
    method: "OPTIONS",
    headers: {
      Origin: "https://afuchat.com",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  if (
    options.status !== 204 ||
    options.headers.get("Access-Control-Allow-Origin") !== "https://afuchat.com"
  ) {
    throw new Error(
      `Chat CORS preflight failed (HTTP ${options.status}, allowed origin ${options.headers.get("Access-Control-Allow-Origin") ?? "missing"}).`,
    );
  }

  const unauthenticated = await fetch("https://api.afuchat.com/v1/chat/conversations");
  if (unauthenticated.status !== 401) {
    throw new Error(`Unauthenticated chat request returned HTTP ${unauthenticated.status}.`);
  }

  const invalidSession = await fetch("https://api.afuchat.com/v1/chat/conversations", {
    method: "GET",
    headers: { Authorization: "Bearer invalid-deployment-probe" },
  });
  if (invalidSession.status !== 401) {
    throw new Error(`Invalid-session request returned HTTP ${invalidSession.status}.`);
  }

  const media = await fetch("https://cdn.afuchat.com/chat/__deployment_probe__");
  const mediaBody = await media.text();
  if (media.status !== 400 || !mediaBody.includes("Invalid storage key")) {
    throw new Error(`Legacy CDN probe changed (HTTP ${media.status}).`);
  }
}

const settingsResponse = await getJson(`/${WORKER_NAME}/settings`, "Read current Worker settings");
const settings = settingsResponse.result;
const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
const byName = new Map(bindings.map((binding) => [binding.name, binding]));

if (
  byName.get("AFUCHAT_ASSETS")?.type !== "r2_bucket" ||
  byName.get("AFUCHAT_ASSETS")?.bucket_name !== "afuchat-media" ||
  byName.get("SUPABASE_URL")?.type !== "plain_text" ||
  byName.get("SUPABASE_ANON_KEY")?.type !== "plain_text" ||
  byName.get("MAX_UPLOAD_BYTES")?.type !== "plain_text"
) {
  throw new Error("Live Worker bindings differ from the expected AfuChat media configuration; deployment stopped.");
}

const subdomainResponse = await getJson(`/${WORKER_NAME}/subdomain`, "Read Worker subdomain settings");
if (subdomainResponse.result?.enabled !== false) {
  throw new Error("The Worker has an unexpected public workers.dev subdomain; deployment stopped.");
}

const legacySource = await getCurrentWorkerSource();
if (
  !legacySource.includes("AFUCHAT_ASSETS") ||
  !legacySource.includes('"/chat/"') ||
  !legacySource.includes("proxySupabaseRequest")
) {
  throw new Error("The current Worker source does not match the expected media proxy; deployment stopped.");
}

await assertProductionMediaPreflight();

const sourcePath = path.join(WORKER_ROOT, "src", "index.ts");
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  },
  fileName: "chat.ts",
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
if (errors.length) {
  throw new Error("Chat Worker TypeScript transpilation failed.");
}

const chatModule = compiled.outputText;
const legacyModule = legacySource.replace(/\/\/# sourceMappingURL=.*$/m, "");
const entryModule = [
  'import chat from "./chat.js";',
  'import legacyMedia from "./legacy-media.js";',
  "",
  "export default {",
  "  async fetch(request, env, ctx) {",
  "    const pathname = new URL(request.url).pathname;",
  '    if (pathname === "/v1/chat" || pathname.startsWith("/v1/chat/")) {',
  "      return chat.fetch(request, env, ctx);",
  "    }",
  "    return legacyMedia.fetch(request, env, ctx);",
  "  },",
  "};",
  "",
].join("\n");

const modules = {
  "index.js": entryModule,
  "chat.js": chatModule,
  "legacy-media.js": legacyModule,
};

if (!APPLY) {
  console.log(JSON.stringify({
    mode: "dry-run",
    target: WORKER_NAME,
    preservesLegacyMedia: true,
    routeChanges: 0,
    workersDevEnabled: false,
    existingBindings: bindings.map(({ name, type }) => ({ name, type })),
    modules: Object.fromEntries(
      Object.entries(modules).map(([name, content]) => [name, Buffer.byteLength(content)]),
    ),
    nextStep: "Run with --apply to deploy and execute production smoke tests.",
  }));
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupModulePath = `/tmp/${WORKER_NAME}-predeploy-${timestamp}.js`;
const backupSettingsPath = `/tmp/${WORKER_NAME}-settings-${timestamp}.json`;
await writeFile(backupModulePath, legacySource, { mode: 0o600 });
await writeFile(backupSettingsPath, JSON.stringify(settings), { mode: 0o600 });
await chmod(backupModulePath, 0o600);
await chmod(backupSettingsPath, 0o600);

const metadata = {
  ...settings,
  main_module: "index.js",
};

await uploadBundle(metadata, modules, "Deploy AfuChat Worker");
try {
  await assertProductionMediaPostflight();
} catch (smokeTestError) {
  const reason = smokeTestError instanceof Error ? smokeTestError.message : "unknown smoke-test failure";
  try {
    await uploadBundle(
      metadata,
      { "index.js": legacySource },
      "Restore original media Worker",
    );
    await assertProductionMediaPreflight();
  } catch {
    throw new Error("Production smoke tests failed and automatic rollback could not be confirmed.");
  }
  throw new Error(`Production smoke tests failed (${reason}); the previous media-only Worker was restored.`);
}

console.log(JSON.stringify({
  mode: "deployed",
  target: WORKER_NAME,
  preservesLegacyMedia: true,
  routeChanges: 0,
  workersDevEnabled: false,
  smokeTests: [
    "chat health",
    "CORS preflight",
    "unauthenticated rejection",
    "invalid-session rejection",
    "legacy CDN media route",
  ],
  modules: Object.fromEntries(
    Object.entries(modules).map(([name, content]) => [name, Buffer.byteLength(content)]),
  ),
}));
