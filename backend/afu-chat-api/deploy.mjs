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
  return extractModule(buffer, response.headers.get("content-type") || "", "index.js");
}

async function assertProductionPreflight() {
  const chat = await fetch("https://api.afuchat.com/v1/chat/healthz");
  const chatBody = await chat.text();
  if (
    chat.status !== 404 ||
    !chatBody.includes("Route not found") ||
    !chat.headers.get("X-AfuChat-Request-Id")
  ) {
    throw new Error("The existing chat endpoint differs from the expected legacy response; deployment stopped.");
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
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const health = await fetch("https://api.afuchat.com/v1/chat/healthz");
    const body = await health.json().catch(() => null);
    lastStatus = health.status;
    lastWorker = body?.worker ?? "unknown";
    if (
      health.status === 200 &&
      body?.product === "afuchat" &&
      body?.worker === WORKER_NAME &&
      body?.status === "ok"
    ) {
      return;
    }
    if (attempt < 15) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Chat health check failed after 16 attempts (HTTP ${lastStatus}, worker ${lastWorker}).`);
}

async function assertProductionPostflight() {
  await waitForChatHealth();

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

  const deployedSettings = await getJson(`/${WORKER_NAME}/settings`, "Verify API Worker settings");
  const deployedBindings = deployedSettings.result?.bindings || [];
  if (deployedBindings.some((binding) => binding.name === "AFUCHAT_ASSETS")) {
    throw new Error("The production Worker still has the legacy media R2 binding.");
  }
}

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

const legacySource = await getCurrentWorkerSource();
if (
  !legacySource.includes("AFUCHAT_ASSETS") ||
  !legacySource.includes('"/chat/"') ||
  !legacySource.includes("proxySupabaseRequest")
) {
  throw new Error("The existing Worker source differs from the expected legacy media handler; deployment stopped.");
}

await assertProductionPreflight();

const sourcePath = path.join(WORKER_ROOT, "src", "index.ts");
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

const modules = { "index.js": compiled.outputText };
const mediaBindingNames = new Set(["AFUCHAT_ASSETS", "MAX_UPLOAD_BYTES"]);
const apiSettings = {
  ...settings,
  bindings: bindings.filter((binding) => !mediaBindingNames.has(binding.name)),
};

if (!APPLY) {
  console.log(JSON.stringify({
    mode: "dry-run",
    target: WORKER_NAME,
    existingWorker: true,
    createSimilarWorker: false,
    removesLegacyMediaBinding: true,
    routeChanges: 0,
    workersDevEnabled: false,
    removedBindings: bindings
      .filter((binding) => mediaBindingNames.has(binding.name))
      .map(({ name }) => name),
    preservedBindings: apiSettings.bindings.map(({ name, type }) => ({ name, type })),
    modules: Object.fromEntries(
      Object.entries(modules).map(([name, content]) => [name, Buffer.byteLength(content)]),
    ),
    endpoints: ["GET /v1/chat/healthz", "GET /v1/chat/conversations"],
    nextStep: "Run with --apply to replace the existing Worker and run production smoke tests.",
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

const originalMetadata = { ...settings, main_module: "index.js" };
const apiMetadata = { ...apiSettings, main_module: "index.js" };

await uploadBundle(apiMetadata, modules, "Deploy AfuChat API");
try {
  await assertProductionPostflight();
} catch (smokeTestError) {
  const reason = smokeTestError instanceof Error ? smokeTestError.message : "unknown smoke-test failure";
  try {
    await uploadBundle(
      originalMetadata,
      { "index.js": legacySource },
      "Restore the original Worker",
    );
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
  removedLegacyMediaBinding: true,
  routeChanges: 0,
  smokeTests: [
    "chat health",
    "CORS preflight",
    "unauthenticated rejection",
    "invalid-session rejection",
    "legacy media binding removed",
  ],
  modules: Object.fromEntries(
    Object.entries(modules).map(([name, content]) => [name, Buffer.byteLength(content)]),
  ),
}));
