#!/usr/bin/env node
import { chmod, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ACCOUNT_ID = "42e79186125e8ff83e51f15816e074de";
const WORKER_NAME = "afuchat-api";
const AUTH_WORKER_NAME = "afuauth-api";
const ZONE_NAME = "afuchat.com";
const CHAT_ASSETS_BUCKET = "afu-chat-assets";
const REQUIRED_ROUTES = [
  "api.afuchat.com/v1/chat/*",
  "cdn.afuchat.com/chat/*",
];
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const WORKER_ROOT = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const wranglerConfig = await readFile(path.join(WORKER_ROOT, "wrangler.toml"), "utf8");
function readQuotedVar(name) {
  const value = wranglerConfig.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"\\s*$`, "m"))?.[1];
  if (!value) throw new Error(`The AfuChat Worker config is missing ${name}.`);
  return value;
}
function rewriteTypescriptImports(source) {
  return source.replace(/(["'])(\.\.?\/[^"']+)\.ts\1/g, "$1$2.js$1");
}
const SUPABASE_URL = readQuotedVar("AFUCHAT_SUPABASE_URL").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = readQuotedVar("AFUCHAT_SUPABASE_ANON_KEY");
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!token) {
  throw new Error("CLOUDFLARE_API_TOKEN is required.");
}

const apiHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
};

function apiPath(pathname) {
  return `${CLOUDFLARE_API}/accounts/${ACCOUNT_ID}/workers/scripts${pathname}`;
}

function zoneApiPath(zoneId, pathname = "") {
  return `${CLOUDFLARE_API}/zones/${zoneId}/workers/routes${pathname}`;
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

async function getZoneJson(pathname, label) {
  const response = await fetch(`${CLOUDFLARE_API}${pathname}`, { headers: apiHeaders });
  return readApiResponse(response, label);
}

async function writeZoneJson(pathname, body, label) {
  const response = await fetch(`${CLOUDFLARE_API}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: apiHeaders.Authorization,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
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

function extractModules(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (boundaryMatch?.[1] || boundaryMatch?.[2] || "").trim();
  if (!boundary) throw new Error("Cloudflare did not return a multipart Worker bundle.");

  const parts = buffer.toString("utf8").split(`--${boundary}`);
  const modules = {};
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd);
    const fieldName = headers.match(/name="([^"]+)"/i)?.[1];
    if (!fieldName || !/\.(?:m?js)$/i.test(fieldName)) continue;
    modules[fieldName] = part.slice(headerEnd + 4).replace(/\r\n$/, "");
  }
  if (Object.keys(modules).length === 0) {
    throw new Error("The deployed Worker bundle has no JavaScript modules.");
  }
  return modules;
}

async function getCurrentWorkerModules() {
  const response = await fetch(apiPath(`/${WORKER_NAME}`), { headers: apiHeaders });
  if (!response.ok) {
    await response.arrayBuffer();
    throw new Error(`Could not read the current ${WORKER_NAME} Worker (HTTP ${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return extractModules(buffer, response.headers.get("content-type") || "");
}

async function readRoutePlan() {
  const zonesResponse = await getZoneJson(`/zones?name=${encodeURIComponent(ZONE_NAME)}`, "Find AfuChat zone");
  const zone = zonesResponse.result?.find((item) => item.name === ZONE_NAME);
  if (!zone?.id) throw new Error(`Cloudflare zone ${ZONE_NAME} was not found.`);

  const routesResponse = await getZoneJson(
    `/zones/${zone.id}/workers/routes`,
    "Read AfuChat Worker routes",
  );
  const routes = Array.isArray(routesResponse.result) ? routesResponse.result : [];
  const routePlan = REQUIRED_ROUTES.map((pattern) => {
    const existing = routes.find((route) => route.pattern === pattern);
    if (existing && existing.script !== WORKER_NAME) {
      throw new Error(`Route ${pattern} is already owned by ${existing.script || "another handler"}.`);
    }
    return {
      pattern,
      action: existing ? "keep" : "create",
      id: existing?.id,
    };
  });
  return { zoneId: zone.id, routePlan };
}

async function createMissingRoutes(zoneId, routePlan) {
  const created = [];
  try {
    for (const route of routePlan.filter((item) => item.action === "create")) {
      const response = await writeZoneJson(
        `/zones/${zoneId}/workers/routes`,
        { pattern: route.pattern, script: WORKER_NAME },
        `Create Worker route ${route.pattern}`,
      );
      const id = response.result?.id;
      if (!id) throw new Error(`Cloudflare did not return an ID for route ${route.pattern}.`);
      created.push({ id, pattern: route.pattern });
    }
  } catch (error) {
    await removeCreatedRoutes(zoneId, created).catch(() => {});
    throw error;
  }
  return created;
}

async function removeCreatedRoutes(zoneId, routes) {
  for (const route of [...routes].reverse()) {
    const response = await fetch(zoneApiPath(zoneId, `/${route.id}`), {
      method: "DELETE",
      headers: { Authorization: apiHeaders.Authorization, Accept: "application/json" },
    });
    await readApiResponse(response, `Remove new Worker route ${route.pattern}`);
  }
}

async function assertProductionPreflight({ allowKnownChatPathCollision = false } = {}) {
  const chat = await fetch("https://api.afuchat.com/v1/chat/healthz");
  const chatBody = await chat.json().catch(() => null);
  if (
    chat.status !== 200 ||
    chatBody?.product !== "afuchat" ||
    chatBody?.status !== "ok"
  ) {
    throw new Error("The existing chat health endpoint is not ready; deployment stopped.");
  }

  const media = await fetch("https://cdn.afuchat.com/chat/");
  const mediaBody = await media.text();
  const hasWorkerRequestId = Boolean(media.headers.get("X-AfuChat-Request-Id"));
  const expectedNamespaceResponse =
    media.status === 404 &&
    mediaBody.includes("The requested media object was not found.") &&
    hasWorkerRequestId;
  const legacyKeyValidation =
    media.status === 400 && mediaBody.includes("Invalid storage key") && hasWorkerRequestId;
  const knownChatPathCollision =
    allowKnownChatPathCollision &&
    media.status === 404 &&
    mediaBody.includes("Route not found") &&
    hasWorkerRequestId;
  if (!expectedNamespaceResponse && !legacyKeyValidation && !knownChatPathCollision) {
    throw new Error("The existing /chat media handler differs from the expected response; deployment stopped.");
  }
}

async function waitForChatHealth() {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await fetch("https://api.afuchat.com/v1/chat/healthz");
    const body = await health.json().catch(() => null);
    lastStatus = health.status;
    const healthIsReady =
      health.status === 200 &&
      body?.product === "afuchat" &&
      body?.status === "ok";

    if (healthIsReady) {
      const appStatus = await fetch("https://api.afuchat.com/v1/chat/status");
      const appStatusBody = await appStatus.json().catch(() => null);
      lastStatus = appStatus.status;
      if (appStatus.status === 200 && appStatusBody?.ok === true) {
        return;
      }
    }
    if (attempt < 29) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Chat health/status check failed after 30 attempts (HTTP ${lastStatus}).`);
}

async function assertProductionPostflight() {
  await waitForChatHealth();

  const appStatus = await fetch("https://api.afuchat.com/v1/chat/status");
  const appStatusBody = await appStatus.json().catch(() => null);
  if (
    appStatus.status !== 200 ||
    appStatusBody?.ok !== true
  ) {
    throw new Error(`AfuChat status check failed (HTTP ${appStatus.status}).`);
  }

  const mediaRoot = await fetch("https://cdn.afuchat.com/chat/");
  const mediaRootBody = await mediaRoot.text();
  if (
    mediaRoot.status !== 404 ||
    !mediaRootBody.includes("The requested media object was not found.") ||
    !mediaRoot.headers.get("X-AfuChat-Request-Id")
  ) {
    throw new Error(`AfuChat CDN namespace root check failed (HTTP ${mediaRoot.status}).`);
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
    headers: { Authorization: "Bearer invalid-deployment-probe" },
  });
  if (invalidSession.status !== 401) {
    throw new Error(`Invalid-session request returned HTTP ${invalidSession.status}.`);
  }

  for (const path of [
    "/v1/chat/storage/usage",
  ]) {
    const storage = await fetch(`https://api.afuchat.com${path}`);
    if (storage.status !== 401) {
      throw new Error(`Unauthenticated media request ${path} returned HTTP ${storage.status}.`);
    }
  }

  const authHealth = await fetch("https://api.afuchat.com/v1/auth/healthz");
  const authBody = await authHealth.json().catch(() => null);
  if (
    authHealth.status !== 200 ||
    authBody?.worker !== AUTH_WORKER_NAME ||
    authBody?.status !== "ok"
  ) {
    throw new Error(`AfuAuth health check failed (HTTP ${authHealth.status}).`);
  }

  const deployedSettings = await getJson(`/${WORKER_NAME}/settings`, "Verify API Worker settings");
  const deployedBindings = deployedSettings.result?.bindings || [];
  const assetsBinding = deployedBindings.find((binding) => binding.name === "AFUCHAT_ASSETS");
  if (assetsBinding?.type !== "r2_bucket" || assetsBinding.bucket_name !== CHAT_ASSETS_BUCKET) {
    throw new Error("The production Worker is not bound to the dedicated AfuChat assets bucket.");
  }
  const authBinding = deployedBindings.find((binding) => binding.name === "AFUAUTH_API");
  if (authBinding?.type !== "service" || authBinding.service !== AUTH_WORKER_NAME) {
    throw new Error("The AfuChat Worker is not bound to afuauth-api.");
  }
  const zoneRoutes = await getZoneJson(
    `/zones/${routeState.zoneId}/workers/routes`,
    "Verify AfuChat Worker routes",
  );
  const currentRoutes = Array.isArray(zoneRoutes.result) ? zoneRoutes.result : [];
  for (const route of REQUIRED_ROUTES) {
    if (!currentRoutes.some((item) => item.pattern === route && item.script === WORKER_NAME)) {
      throw new Error(`Worker route ${route} is not active after deployment.`);
    }
  }
}

const routeState = await readRoutePlan();
const settingsResponse = await getJson(`/${WORKER_NAME}/settings`, "Read current Worker settings");
const settings = settingsResponse.result;
const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
const byName = new Map(bindings.map((binding) => [binding.name, binding]));

if (
  byName.get("AFUCHAT_ASSETS")?.type !== "r2_bucket" ||
  byName.get("AFUCHAT_ASSETS")?.bucket_name !== CHAT_ASSETS_BUCKET ||
  byName.get("SUPABASE_URL")?.type !== "plain_text" ||
  byName.get("SUPABASE_ANON_KEY")?.type !== "plain_text"
) {
  throw new Error("The existing Worker does not match the expected AfuChat deployment target; deployment stopped.");
}
const subdomainResponse = await getJson(`/${WORKER_NAME}/subdomain`, "Read Worker subdomain settings");
if (subdomainResponse.result?.enabled !== false) {
  throw new Error("The Worker has an unexpected public workers.dev subdomain; deployment stopped.");
}

const originalModules = await getCurrentWorkerModules();
const deployedLegacySource = originalModules["legacy.js"] || originalModules["index.js"];
if (
  !deployedLegacySource.includes("AFUCHAT_ASSETS") ||
  !deployedLegacySource.includes('"/chat/"') ||
  !deployedLegacySource.includes("proxySupabaseRequest") ||
  !deployedLegacySource.includes("storage-containers")
) {
  throw new Error("The existing Worker source differs from the expected legacy media handler; deployment stopped.");
}
const allowKnownChatPathCollision =
  /API_PREFIX\s*=\s*"\/chat"/.test(deployedLegacySource) &&
  !deployedLegacySource.includes("isPublicAssetRequest");
const mediaHandlerPath = path.resolve(WORKER_ROOT, "../../artifacts/afuchat-worker/src/index.ts");
const mediaHandlerTypeScript = await readFile(mediaHandlerPath, "utf8");
const mediaHandlerCompiled = ts.transpileModule(mediaHandlerTypeScript, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  },
  fileName: "legacy.ts",
  reportDiagnostics: true,
});
const mediaHandlerErrors = (mediaHandlerCompiled.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
if (
  mediaHandlerErrors.length ||
  !mediaHandlerTypeScript.includes('const API_PREFIX = "/chat"') ||
  !mediaHandlerTypeScript.includes('const CDN_PREFIX = "/chat/"') ||
  !mediaHandlerTypeScript.includes("function isPublicAssetRequest")
) {
  throw new Error("The local AfuChat media handler is not ready for the shared chat path.");
}
const legacySource = rewriteTypescriptImports(mediaHandlerCompiled.outputText);

await assertProductionPreflight({ allowKnownChatPathCollision });

const sourcePath = path.join(WORKER_ROOT, "src", "index.ts");
const sourceDirectory = path.dirname(sourcePath);
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  },
  fileName: "index.ts",
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
if (errors.length) {
  throw new Error("AfuChat API TypeScript transpilation failed.");
}

const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true });
const extraModules = {};
for (const entry of sourceEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name === "index.ts") continue;
  const modulePath = path.join(sourceDirectory, entry.name);
  const moduleSource = await readFile(modulePath, "utf8");
  const moduleCompiled = ts.transpileModule(moduleSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
    },
    fileName: entry.name,
    reportDiagnostics: true,
  });
  const moduleErrors = (moduleCompiled.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (moduleErrors.length) {
    throw new Error(`AfuChat API TypeScript transpilation failed for ${entry.name}.`);
  }
  extraModules[entry.name.replace(/\.ts$/, ".js")] = rewriteTypescriptImports(moduleCompiled.outputText);
}

const wrapperSource = `import chatApi from "./chat-api.js";
import legacyApi from "./legacy.js";
import { createAfuChatWorkerRouter } from "./worker-router.js";

export default createAfuChatWorkerRouter(chatApi, legacyApi);`;

const modules = {
  "index.js": wrapperSource,
  "chat-api.js": rewriteTypescriptImports(compiled.outputText),
  "legacy.js": legacySource,
  ...extraModules,
};
const authServiceBinding = byName.get("AFUAUTH_API");
if (
  authServiceBinding &&
  (authServiceBinding.type !== "service" || authServiceBinding.service !== AUTH_WORKER_NAME)
) {
  throw new Error("The existing AFUAUTH_API binding points to an unexpected Worker.");
}
const chatBindings = bindings.map((binding) => ({ ...binding }));
const assetsBinding = chatBindings.find((binding) => binding.name === "AFUCHAT_ASSETS");
if (!assetsBinding || assetsBinding.type !== "r2_bucket") {
  throw new Error("The AfuChat assets bucket binding is missing or invalid.");
}
assetsBinding.bucket_name = CHAT_ASSETS_BUCKET;
if (!authServiceBinding) {
  chatBindings.push({
    type: "service",
    name: "AFUAUTH_API",
    service: AUTH_WORKER_NAME,
    environment: "production",
  });
}
for (const [name, text] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
  ["AFUCHAT_DATABASE_SCHEMA", "public"],
]) {
  const binding = chatBindings.find((item) => item.name === name);
  if (binding && binding.type !== "plain_text") {
    throw new Error(`${name} has an unexpected Worker binding type.`);
  }
  if (binding) binding.text = text;
  else chatBindings.push({ type: "plain_text", name, text });
}
const databaseSchemaBinding = chatBindings.find((binding) => binding.name === "AFUCHAT_DATABASE_SCHEMA");
if (databaseSchemaBinding?.text !== "public") {
  throw new Error("The AfuChat database schema binding could not be set to public.");
}
const apiSettings = {
  ...settings,
  bindings: chatBindings,
};

if (!APPLY) {
  console.log(JSON.stringify({
    mode: "dry-run",
    target: WORKER_NAME,
    existingWorker: true,
    createSimilarWorker: false,
    preservesLegacyMediaHandler: true,
    createsMissingCanonicalRoutes: routeState.routePlan.some(({ action }) => action === "create"),
    routes: routeState.routePlan,
    workersDevEnabled: false,
    targetAssetBucket: CHAT_ASSETS_BUCKET,
    preservedBindings: apiSettings.bindings.map(({ name, type, bucket_name }) => ({
      name,
      type,
      ...(type === "r2_bucket" ? { bucket_name } : {}),
    })),
    modules: Object.fromEntries(
      Object.entries(modules).map(([name, content]) => [name, Buffer.byteLength(content)]),
    ),
    endpoints: [
      "GET /v1/chat/healthz",
      "GET|POST /v1/chat/status",
      "GET /v1/chat/conversations",
      "POST /v1/chat/account/export",
      "POST /v1/chat/payments/pesapal-initiate",
      "GET|POST /v1/chat/payments/pesapal-callback",
      "GET|POST /v1/chat/payments/pesapal-ipn",
      "POST /v1/chat/storage/containers",
      "GET /v1/chat/storage/containers",
      "POST /v1/chat/storage/containers/{containerId}/upload?name={objectName}",
      "GET /v1/chat/storage/containers/{containerId}/objects",
      "POST /v1/chat/storage/containers/{containerId}/objects/confirm",
      "DELETE /v1/chat/storage/containers/{containerId}/objects/by-key",
      "GET /v1/chat/storage/usage",
      "GET|HEAD /v1/chat/storage/objects/{key}",
      "non-OPTIONS methods on /v1/chat/videos and /v1/chat/videos/* currently return 501",
      "POST /v1/auth/session (AfuAuth service binding; not an AfuChat route)",
      "GET|HEAD cdn.afuchat.com/chat/{key} media delivery",
    ],
    nextStep: "Run with --apply to deploy the Worker and add any missing canonical routes.",
  }));
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupModulePath = `/tmp/${WORKER_NAME}-predeploy-${timestamp}.json`;
const backupSettingsPath = `/tmp/${WORKER_NAME}-settings-${timestamp}.json`;
await writeFile(backupModulePath, JSON.stringify(originalModules), { mode: 0o600 });
await writeFile(backupSettingsPath, JSON.stringify(settings), { mode: 0o600 });
await chmod(backupModulePath, 0o600);
await chmod(backupSettingsPath, 0o600);

const originalMetadata = { ...settings, main_module: "index.js" };
const apiMetadata = { ...apiSettings, main_module: "index.js" };

let uploaded = false;
let createdRoutes = [];
try {
  await uploadBundle(apiMetadata, modules, "Deploy AfuChat API");
  uploaded = true;
  createdRoutes = await createMissingRoutes(routeState.zoneId, routeState.routePlan);
  await assertProductionPostflight();
} catch (smokeTestError) {
  const reason = smokeTestError instanceof Error ? smokeTestError.message : "unknown smoke-test failure";
  try {
    if (uploaded) {
      await uploadBundle(originalMetadata, originalModules, "Restore the original Worker");
    }
    await removeCreatedRoutes(routeState.zoneId, createdRoutes);
    await assertProductionPreflight();
  } catch {
    throw new Error("Production smoke tests failed and automatic rollback could not be confirmed.");
  }
  throw new Error(`Production smoke tests failed (${reason}); the original Worker was restored.`);
}

console.log(JSON.stringify({
  mode: "deployed",
  target: WORKER_NAME,
  createdNewWorker: false,
  preservedLegacyMediaHandler: true,
  routes: routeState.routePlan.map(({ pattern, action }) => ({ pattern, action })),
  smokeTests: [
    "chat health",
    "CORS preflight",
    "unauthenticated rejection",
    "AfuAuth shared-session rejection",
    "storage handler route",
    "legacy CDN asset route",
    "dedicated AfuChat assets bucket binding",
    "canonical chat API and storage routing",
  ],
  modules: Object.fromEntries(
    Object.entries(modules).map(([name, content]) => [name, Buffer.byteLength(content)]),
  ),
}));
