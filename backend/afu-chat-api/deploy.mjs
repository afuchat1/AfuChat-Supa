#!/usr/bin/env node
import { chmod, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ACCOUNT_ID = "42e79186125e8ff83e51f15816e074de";
const WORKER_NAME = "afuchat-api";
const AUTH_WORKER_NAME = "afuauth-api";
const ZONE_NAME = "afuchat.com";
const REQUIRED_ROUTES = [
  "api.afuchat.com/v1/chat/*",
  "api.afuchat.com/v1/storage*",
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
  if (routes.some((route) => route.pattern === "api.afuchat.com/afuchat/*")) {
    throw new Error("The deprecated /afuchat route still exists; remove that route before deploying.");
  }
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

async function assertProductionPreflight() {
  const chat = await fetch("https://api.afuchat.com/v1/chat/healthz");
  const chatBody = await chat.json().catch(() => null);
  if (
    chat.status !== 200 ||
    chatBody?.product !== "afuchat" ||
    chatBody?.worker !== WORKER_NAME ||
    chatBody?.status !== "ok"
  ) {
    throw new Error("The existing chat health endpoint differs from the expected AfuChat Worker; deployment stopped.");
  }

  const media = await fetch("https://cdn.afuchat.com/chat/__deployment_probe__");
  const mediaBody = await media.text();
  if (
    media.status !== 400 ||
    !mediaBody.includes("Invalid storage key") ||
    !media.headers.get("X-AfuChat-Request-Id")
  ) {
    throw new Error("The existing /chat media handler differs from the expected response; deployment stopped.");
  }
}

async function waitForChatHealth() {
  let lastStatus = 0;
  let lastWorker = "unknown";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await fetch("https://api.afuchat.com/v1/chat/healthz");
    const body = await health.json().catch(() => null);
    lastStatus = health.status;
    lastWorker = body?.worker ?? "unknown";
    const healthIsReady =
      health.status === 200 &&
      body?.product === "afuchat" &&
      body?.worker === WORKER_NAME &&
      body?.status === "ok";

    if (healthIsReady) {
      const appStatus = await fetch("https://api.afuchat.com/v1/chat/status");
      const appStatusBody = await appStatus.json().catch(() => null);
      lastStatus = appStatus.status;
      lastWorker = appStatusBody?.worker ?? lastWorker;
      if (appStatus.status === 200 && appStatusBody?.worker === WORKER_NAME) {
        return;
      }
    }
    if (attempt < 29) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Chat health/status check failed after 30 attempts (HTTP ${lastStatus}, worker ${lastWorker}).`);
}

async function assertProductionPostflight() {
  await waitForChatHealth();

  const appStatus = await fetch("https://api.afuchat.com/v1/chat/status");
  const appStatusBody = await appStatus.json().catch(() => null);
  if (
    appStatus.status !== 200 ||
    appStatusBody?.worker !== WORKER_NAME ||
    appStatusBody?.services?.supabase?.ok !== true
  ) {
    throw new Error(`AfuChat status check failed (HTTP ${appStatus.status}).`);
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

  const storage = await fetch("https://api.afuchat.com/v1/storage/usage");
  if (storage.status !== 401) {
    throw new Error(`Unauthenticated media request returned HTTP ${storage.status}.`);
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
  if (assetsBinding?.type !== "r2_bucket" || assetsBinding.bucket_name !== "afuchat-media") {
    throw new Error("The production Worker no longer has its existing media bucket binding.");
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
  if (currentRoutes.some((item) => item.pattern === "api.afuchat.com/afuchat/*")) {
    throw new Error("The deprecated /afuchat route remains active.");
  }
}

const routeState = await readRoutePlan();
const settingsResponse = await getJson(`/${WORKER_NAME}/settings`, "Read current Worker settings");
const settings = settingsResponse.result;
const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
const byName = new Map(bindings.map((binding) => [binding.name, binding]));

if (
  byName.get("AFUCHAT_ASSETS")?.type !== "r2_bucket" ||
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
const legacySource = originalModules["legacy.js"] || originalModules["index.js"];
if (
  !legacySource.includes("AFUCHAT_ASSETS") ||
  !legacySource.includes('"/chat/"') ||
  !legacySource.includes("proxySupabaseRequest") ||
  !legacySource.includes("storage-containers") ||
  !legacySource.includes('"/afuchat"')
) {
  throw new Error("The existing Worker source differs from the expected legacy media handler; deployment stopped.");
}

await assertProductionPreflight();

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

const CHAT_PREFIX = "/v1/chat";
const isChatPath = (pathname) =>
  pathname === CHAT_PREFIX || pathname.startsWith(\`\${CHAT_PREFIX}/\`);
const isStoragePath = (pathname) =>
  pathname === "/v1/storage" ||
  pathname.startsWith("/v1/storage/") ||
  pathname === "/v1/storage-containers" ||
  pathname.startsWith("/v1/storage-containers/");

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isChatPath(url.pathname)) return chatApi.fetch(request, env, ctx);
    if (isStoragePath(url.pathname)) {
      url.pathname = \`/afuchat\${url.pathname}\`;
      return legacyApi.fetch(new Request(url, request), env, ctx);
    }
    return legacyApi.fetch(request, env, ctx);
  },
};`;

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
    addsDeprecatedAfuChatNamespace: false,
    routes: routeState.routePlan,
    workersDevEnabled: false,
    preservedBindings: apiSettings.bindings.map(({ name, type }) => ({ name, type })),
    modules: Object.fromEntries(
      Object.entries(modules).map(([name, content]) => [name, Buffer.byteLength(content)]),
    ),
    endpoints: [
      "GET /v1/chat/healthz",
      "GET /v1/chat/status",
      "GET /v1/chat/conversations",
      "POST /v1/chat/account/export",
      "POST /v1/chat/payments/pesapal-initiate",
      "GET /v1/chat/payments/pesapal-callback",
      "GET|POST /v1/chat/payments/pesapal-ipn",
      "POST /v1/chat/videos/* returns 501 until the video pipeline is configured",
      "POST /v1/auth/session (AfuAuth service binding)",
      "existing /v1/storage* media API",
      "existing cdn.afuchat.com/chat/* assets",
    ],
    nextStep: "Run with --apply to deploy this Worker and add only missing routes.",
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
    "existing media bucket retained",
    "no /afuchat route",
  ],
  modules: Object.fromEntries(
    Object.entries(modules).map(([name, content]) => [name, Buffer.byteLength(content)]),
  ),
}));
