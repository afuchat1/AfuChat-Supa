#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACCOUNT_ID = "42e79186125e8ff83e51f15816e074de";
const ZONE_ID = "d3eb877a0ae2af4dbb94d8e6b4310af9";
const HOSTNAME = "api.afuchat.com";
const ROOT_PATTERN = `${HOSTNAME}/`;
const WORKER_NAME = "afu-api";
const AUTH_SERVICE = "afuauth-api";
const API = "https://api.cloudflare.com/client/v4";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = await readFile(path.join(ROOT, "src/index.mjs"), "utf8");
const APPLY = process.argv.includes("--apply");
const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!TOKEN) throw new Error("CLOUDFLARE_API_TOKEN is required.");

const PRODUCT_ROUTE_OWNERS = new Map([
  [`${HOSTNAME}/v1/auth/*`, "afuauth-api"],
  [`${HOSTNAME}/v1/auth-resolve-identifier`, "afuauth-api"],
  [`${HOSTNAME}/chat/*`, "afuchat-api"],
  [`${HOSTNAME}/v1/chat/*`, "afuchat-api"],
  [`${HOSTNAME}/v1/storage*`, "afuchat-api"],
  [`${HOSTNAME}/v1/cloud/*`, "afucloud-api"],
  [`${HOSTNAME}/afucloud/*`, "afucloud-api"],
  [`${HOSTNAME}/v1/ai/*`, "afuai-api"],
  [`${HOSTNAME}/v1/ads/*`, "afuads-api"],
  [`${HOSTNAME}/v1/mail/*`, "afumail-api"],
]);

function apiErrors(data) {
  return (Array.isArray(data?.errors) ? data.errors : [])
    .map((error) => error.message)
    .filter(Boolean)
    .slice(0, 3);
}

async function cloudflare(pathname, options = {}, label = "Cloudflare API request") {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${TOKEN}`);
  headers.set("Accept", "application/json");

  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${API}${pathname}`, { ...options, headers, body });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const details = apiErrors(data);
    throw new Error(
      `${label} failed with HTTP ${response.status}` +
        (details.length ? `: ${details.join("; ")}` : ""),
    );
  }
  return data;
}

async function listScripts() {
  const result = await cloudflare(
    `/accounts/${ACCOUNT_ID}/workers/scripts?per_page=100`,
    {},
    "List Workers",
  );
  return new Set((result.result || []).map((script) => script.id));
}

async function listRoutes() {
  const result = await cloudflare(
    `/zones/${ZONE_ID}/workers/routes`,
    {},
    "List zone Worker routes",
  );
  return Array.isArray(result.result) ? result.result : [];
}

function apiRoutes(routes) {
  return routes.filter((route) => route.pattern.startsWith(`${HOSTNAME}/`));
}

function assertRouteInventory(routes) {
  const hostRoutes = apiRoutes(routes);
  const rootRoutes = hostRoutes.filter((route) => route.pattern === ROOT_PATTERN);
  if (rootRoutes.length !== 1) {
    throw new Error(`Expected exactly one API root route ${ROOT_PATTERN}; found ${rootRoutes.length}.`);
  }

  const rootRoute = rootRoutes[0];
  if (![AUTH_SERVICE, WORKER_NAME].includes(rootRoute.script)) {
    throw new Error(
      `The API root route is owned by ${rootRoute.script || "an unknown handler"}; refusing to overwrite it.`,
    );
  }

  const seen = new Set();
  for (const route of hostRoutes) {
    if (route === rootRoute) continue;
    const expectedOwner = PRODUCT_ROUTE_OWNERS.get(route.pattern);
    if (!expectedOwner || seen.has(route.pattern)) {
      throw new Error(`Unexpected or duplicate API hostname route: ${route.pattern}`);
    }
    if (route.script !== expectedOwner) {
      throw new Error(
        `Product route ${route.pattern} is owned by ${route.script || "an unknown handler"}; refusing to change it.`,
      );
    }
    seen.add(route.pattern);
  }

  for (const pattern of PRODUCT_ROUTE_OWNERS.keys()) {
    if (!seen.has(pattern)) throw new Error(`Expected product route is missing: ${pattern}`);
  }
  if (hostRoutes.length !== PRODUCT_ROUTE_OWNERS.size + 1) {
    throw new Error(`Unexpected API route count: ${hostRoutes.length}.`);
  }
  return { rootRoute, productRoutes: hostRoutes.filter((route) => route !== rootRoute) };
}

function assertProductRoutesPreserved(beforeRoutes, afterRoutes) {
  const before = assertRouteInventory(beforeRoutes);
  const after = assertRouteInventory(afterRoutes);
  for (const [pattern, owner] of PRODUCT_ROUTE_OWNERS) {
    const original = before.productRoutes.find((route) => route.pattern === pattern);
    const current = after.productRoutes.find((route) => route.pattern === pattern);
    if (!original || !current || current.script !== owner || current.id !== original.id) {
      throw new Error(`Product route ${pattern} changed during the gateway deployment.`);
    }
  }
  return after;
}

async function assertAuthWorkerExists() {
  const scripts = await listScripts();
  if (!scripts.has(AUTH_SERVICE)) {
    throw new Error(`The gateway service target ${AUTH_SERVICE} is missing.`);
  }
}

async function uploadWorker() {
  const metadata = {
    main_module: "index.mjs",
    compatibility_date: "2026-10-06",
    workers_dev: false,
    preview_urls: false,
    bindings: [{
      type: "service",
      name: "AFUAUTH_API",
      service: AUTH_SERVICE,
      environment: "production",
    }],
  };
  const form = new FormData();
  form.set(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    "metadata.json",
  );
  form.set(
    "index.mjs",
    new Blob([SOURCE], { type: "application/javascript+module" }),
    "index.mjs",
  );

  await cloudflare(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`,
    { method: "PUT", body: form },
    `Upload ${WORKER_NAME}`,
  );

  const settings = await cloudflare(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/settings`,
    {},
    `Read ${WORKER_NAME} bindings`,
  );
  const bindings = settings.result?.bindings || [];
  if (!bindings.some((binding) =>
    binding.type === "service" &&
    binding.name === "AFUAUTH_API" &&
    binding.service === AUTH_SERVICE &&
    binding.environment === "production"
  )) {
    throw new Error(`The deployed ${WORKER_NAME} is missing AFUAUTH_API → ${AUTH_SERVICE}.`);
  }
}

async function setRootRoute(route, script) {
  await cloudflare(
    `/zones/${ZONE_ID}/workers/routes/${route.id}`,
    { method: "PUT", body: { pattern: ROOT_PATTERN, script } },
    `Set API root route to ${script}`,
  );
}

async function readProbe(url) {
  const response = await fetch(url, { redirect: "manual" });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Each probe below requires the expected JSON response.
  }
  return { status: response.status, body };
}

async function assertProbe(pathname, assertion, label) {
  const probe = await readProbe(`https://${HOSTNAME}${pathname}`);
  if (!assertion(probe)) {
    throw new Error(
      `${label} failed: HTTP ${probe.status}; response did not match the expected route.`,
    );
  }
  return label;
}

async function verifyPublicRouting() {
  const passed = [];
  passed.push(await assertProbe(
    "/",
    ({ status, body }) => status === 200 && body?.worker === AUTH_SERVICE,
    "API root → afu-api → AfuAuth",
  ));
  passed.push(await assertProbe(
    "/v1/auth/healthz",
    ({ status, body }) => status === 200 && body?.worker === AUTH_SERVICE,
    "AfuAuth product route",
  ));
  passed.push(await assertProbe(
    "/v1/chat/healthz",
    ({ status, body }) =>
      status === 200 &&
      (body?.worker === "afuchat-api" || body?.product === "afuchat"),
    "AfuChat product route",
  ));
  passed.push(await assertProbe(
    "/chat/v1/storage/usage",
    ({ status, body }) => status === 401 && body?.error === "Authentication required",
    "AfuChat compatibility route auth guard",
  ));
  passed.push(await assertProbe(
    "/v1/chat/storage/usage",
    ({ status, body }) => status === 401 && body?.error === "Authentication required",
    "AfuChat storage auth guard",
  ));
  passed.push(await assertProbe(
    "/v1/storage/usage",
    ({ status, body }) => status === 401 && body?.error === "Authentication required",
    "AfuChat storage compatibility route",
  ));
  passed.push(await assertProbe(
    "/chat/rest/v1/profiles?select=id&limit=0",
    ({ status, body }) => status === 200 && Array.isArray(body) && body.length === 0,
    "Read-only Supabase compatibility query",
  ));
  passed.push(await assertProbe(
    "/v1/cloud/healthz",
    ({ status, body }) =>
      status === 404 &&
      body?.path === "/v1/cloud/healthz" &&
      body?.api_version === "v1",
    "AfuCloud route remains with its existing Worker",
  ));
  passed.push(await assertProbe(
    "/v1/ai/healthz",
    ({ status, body }) =>
      (status === 200 || status === 503) && body?.worker === "afuai-api",
    "AfuAI product route",
  ));
  passed.push(await assertProbe(
    "/v1/ads/healthz",
    ({ status, body }) => status === 200 && body?.worker === "afuads-api",
    "AfuAds route remains with its existing Worker",
  ));
  passed.push(await assertProbe(
    "/v1/mail/healthz",
    ({ status, body }) => status === 200 && body?.worker === "afumail-api",
    "AfuMail route remains with its existing Worker",
  ));

  const cdn = await readProbe("https://cdn.afuchat.com/chat/__deployment_probe__");
  if (cdn.status !== 400 || cdn.body?.error !== "Invalid storage key") {
    throw new Error("The existing AfuChat CDN route changed unexpectedly.");
  }
  passed.push("AfuChat CDN route remains on its existing Worker");
  return passed;
}

async function deploy() {
  await assertAuthWorkerExists();
  const beforeRoutes = await listRoutes();
  const before = assertRouteInventory(beforeRoutes);
  const needsRouteUpdate = before.rootRoute.script !== WORKER_NAME;
  const plan = {
    mode: APPLY ? "apply" : "dry-run",
    worker: WORKER_NAME,
    rootRoute: {
      pattern: ROOT_PATTERN,
      fromWorker: before.rootRoute.script,
      toWorker: WORKER_NAME,
      updateRequired: needsRouteUpdate,
    },
    productRoutesPreserved: before.productRoutes.map(({ pattern, script }) => ({ pattern, script })),
    productRouteCount: before.productRoutes.length,
    customDomainChanged: false,
    dnsChanged: false,
    cloudflareObjectsDeleted: [],
  };

  if (!APPLY) {
    console.log(JSON.stringify(plan));
    return;
  }

  await uploadWorker();
  let rootRouteChanged = false;
  try {
    const latestRoutes = await listRoutes();
    const latest = assertRouteInventory(latestRoutes);
    if (latest.rootRoute.script !== WORKER_NAME) {
      await setRootRoute(latest.rootRoute, WORKER_NAME);
      rootRouteChanged = true;
    }

    const afterRoutes = await listRoutes();
    const after = assertProductRoutesPreserved(beforeRoutes, afterRoutes);
    if (after.rootRoute.script !== WORKER_NAME) {
      throw new Error("The API root route is not owned by afu-api.");
    }

    const smokeTests = await verifyPublicRouting();
    console.log(JSON.stringify({
      mode: "deployed",
      worker: WORKER_NAME,
      rootRoute: { pattern: ROOT_PATTERN, script: WORKER_NAME },
      productRoutesPreserved: after.productRoutes.length,
      cloudflareObjectsDeleted: [],
      customDomainChanged: false,
      dnsChanged: false,
      smokeTests,
    }));
  } catch (error) {
    if (rootRouteChanged) {
      try {
        const currentRoutes = await listRoutes();
        const currentRoot = assertRouteInventory(currentRoutes).rootRoute;
        await setRootRoute(currentRoot, before.rootRoute.script);
      } catch (rollbackError) {
        throw new Error(
          `${error.message}. Root-route rollback failed: ${rollbackError.message}`,
        );
      }
    }
    throw error;
  }
}

await deploy();
