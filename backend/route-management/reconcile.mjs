#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";

const ACCOUNT_ID = "42e79186125e8ff83e51f15816e074de";
const ZONE_ID = "d3eb877a0ae2af4dbb94d8e6b4310af9";
const API = "https://api.cloudflare.com/client/v4";
const APPLY = process.argv.includes("--apply");
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required.");

const routes = new Map([
  ["api.afuchat.com/v1/auth/*", "afuauth-api"],
  ["api.afuchat.com/v1/chat/*", "afuchat-api"],
  ["api.afuchat.com/v1/mail/*", "afumail-api"],
  ["api.afuchat.com/v1/cloud/*", "afucloud-api"],
  ["api.afuchat.com/v1/ai/*", "afuai-api"],
  ["api.afuchat.com/v1/ads/*", "afuads-api"],
  ["cdn.afuchat.com/chat/*", "afuchat-api"],
  ["cdn.afuchat.com/mail/*", "afumail-api"],
  ["cdn.afuchat.com/cloud/*", "afucloud-api"],
  ["cdn.afuchat.com/ai/*", "afuai-api"],
  ["cdn.afuchat.com/ads/*", "afuads-api"],
]);

const requiredSiteRoute = {
  pattern: "cloud.afuchat.com/*",
  script: "afucloud-web",
};
const rootGatewayRoute = {
  pattern: "api.afuchat.com/",
  script: "afu-api",
};
const apiWorkers = [
  "afu-api",
  "afuauth-api",
  "afuchat-api",
  "afumail-api",
  "afucloud-api",
  "afuai-api",
  "afuads-api",
];

const cdnBindings = [
  { worker: "afuchat-api", name: "AFUCHAT_ASSETS", bucket: "afu-chat-assets" },
  { worker: "afumail-api", name: "MAIL_ASSETS", bucket: "afu-mail-assets" },
  { worker: "afucloud-api", name: "IMAGES_BUCKET", bucket: "afucloud-images" },
  { worker: "afuai-api", name: "AI_ASSETS", bucket: "afu-ai-assets" },
  { worker: "afuads-api", name: "ADS_ASSETS", bucket: "afu-ads-assets" },
];

const apiHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
};

async function request(path, options = {}, label = "Cloudflare request") {
  const headers = new Headers(options.headers);
  headers.set("Authorization", apiHeaders.Authorization);
  headers.set("Accept", "application/json");
  if (options.body && typeof options.body !== "string") {
    headers.set("Content-Type", "application/json");
    options = { ...options, body: JSON.stringify(options.body) };
  }

  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const codes = Array.isArray(data?.errors)
      ? data.errors.map((item) => item.code).filter((code) => code !== undefined)
      : [];
    throw new Error(
      `${label} failed with HTTP ${response.status}` +
        (codes.length ? ` (Cloudflare codes: ${codes.join(", ")})` : ""),
    );
  }
  return data.result;
}

async function getRoutes() {
  const result = await request(`/zones/${ZONE_ID}/workers/routes`, {}, "Read Worker routes");
  return Array.isArray(result) ? result : [];
}

function isProductHostRoute(route) {
  const routeHost = route.pattern.split("/", 1)[0];
  return ["api.afuchat.com", "cdn.afuchat.com"].some((host) => {
    const escaped = routeHost.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(host);
  });
}

function assertKnownOwners(currentRoutes) {
  for (const [pattern, owner] of routes) {
    const matches = currentRoutes.filter((route) => route.pattern === pattern);
    if (matches.length > 1) throw new Error(`Duplicate canonical route: ${pattern}`);
    if (matches.length === 1 && matches[0].script !== owner) {
      throw new Error(`Route ${pattern} is owned by ${matches[0].script || "unknown"}, not ${owner}.`);
    }
  }

  const rootMatches = currentRoutes.filter((route) => route.pattern === rootGatewayRoute.pattern);
  if (
    rootMatches.length > 1 ||
    (rootMatches.length === 1 && rootMatches[0].script !== rootGatewayRoute.script)
  ) {
    throw new Error(`${rootGatewayRoute.pattern} must remain owned by ${rootGatewayRoute.script}.`);
  }

  const siteMatches = currentRoutes.filter((route) => route.pattern === requiredSiteRoute.pattern);
  if (siteMatches.length !== 1 || siteMatches[0].script !== requiredSiteRoute.script) {
    throw new Error(
      `The unrelated ${requiredSiteRoute.pattern} site route changed; refusing to modify it.`,
    );
  }
}

async function assertProductWorkersAndBuckets() {
  const settingsByWorker = new Map();
  for (const worker of apiWorkers) {
    const settings = await request(
      `/accounts/${ACCOUNT_ID}/workers/scripts/${worker}/settings`,
      {},
      `Read ${worker} settings`,
    );
    if (!settings) throw new Error(`Required Worker ${worker} is missing.`);
    settingsByWorker.set(worker, settings);
  }

  for (const { worker, name, bucket } of cdnBindings) {
    const settings = settingsByWorker.get(worker);
    const bindings = settings?.bindings || [];
    const r2Bindings = bindings.filter((item) => item.type === "r2_bucket");
    const binding = r2Bindings.find((item) => item.name === name);
    if (
      r2Bindings.length !== 1 ||
      binding?.type !== "r2_bucket" ||
      binding.bucket_name !== bucket
    ) {
      throw new Error(`${worker} must bind ${name} to its isolated ${bucket} bucket.`);
    }
  }
}

async function assertCompatibilityDomains() {
  const requiredDomains = [
    { bucket: "afuchat-media", domain: "cdn.afuchat.com" },
    { bucket: "afucloud-images", domain: "img.afuchat.com" },
  ];
  for (const { bucket, domain } of requiredDomains) {
    const result = await request(
      `/accounts/${ACCOUNT_ID}/r2/buckets/${bucket}/domains/custom`,
      {},
      `Read ${bucket} custom domains`,
    );
    const match = (result?.domains || []).find((item) =>
      item.domain === domain &&
      item.enabled === true &&
      item.status?.ssl === "active" &&
      item.status?.ownership === "active"
    );
    if (!match) {
      throw new Error(`Required existing-object domain ${domain} on ${bucket} is not active.`);
    }
  }

  const records = await request(
    `/zones/${ZONE_ID}/dns_records?name=api.afuchat.com&per_page=100`,
    {},
    "Read API hostname DNS",
  );
  const failClosed = (records || []).some((record) =>
    record.type === "A" &&
    record.content === "192.0.2.1" &&
    record.proxied === true
  );
  if (!failClosed) {
    throw new Error("api.afuchat.com no longer has its proxied fail-closed origin record.");
  }
}

function summarize(currentRoutes) {
  const expected = [...routes, [rootGatewayRoute.pattern, rootGatewayRoute.script]].map(([pattern, script]) => {
    const current = currentRoutes.find((route) => route.pattern === pattern);
    return { pattern, script, action: current ? "keep" : "create" };
  });
  const remove = currentRoutes
    .filter(isProductHostRoute)
    .filter((route) =>
      !routes.has(route.pattern) &&
      route.pattern !== rootGatewayRoute.pattern
    )
    .map(({ id, pattern, script }) => ({ id, pattern, script }));
  return { expected, remove };
}

async function createRoute(pattern, script) {
  const result = await request(
    `/zones/${ZONE_ID}/workers/routes`,
    { method: "POST", body: { pattern, script } },
    `Create ${pattern}`,
  );
  if (!result?.id) throw new Error(`Cloudflare did not return an ID for ${pattern}.`);
  return { id: result.id, pattern, script };
}

async function deleteRoute(route) {
  await request(
    `/zones/${ZONE_ID}/workers/routes/${route.id}`,
    { method: "DELETE" },
    `Delete ${route.pattern}`,
  );
}

async function restoreRoute(route) {
  await request(
    `/zones/${ZONE_ID}/workers/routes`,
    { method: "POST", body: { pattern: route.pattern, script: route.script } },
    `Restore ${route.pattern}`,
  );
}

async function reconcile(plan) {
  const created = [];
  const removed = [];
  try {
    for (const item of plan.expected.filter((route) => route.action === "create")) {
      created.push(await createRoute(item.pattern, item.script));
    }
    for (const route of plan.remove) {
      await deleteRoute(route);
      removed.push(route);
    }

    const finalRoutes = await getRoutes();
    assertKnownOwners(finalRoutes);
    const finalProductRoutes = finalRoutes.filter(isProductHostRoute);
    if (
      finalProductRoutes.length !== routes.size + 1 ||
      !finalProductRoutes.some((route) =>
        route.pattern === rootGatewayRoute.pattern &&
        route.script === rootGatewayRoute.script
      ) ||
      [...routes].some(([pattern, script]) =>
        !finalProductRoutes.some((route) => route.pattern === pattern && route.script === script)
      )
    ) {
      throw new Error("Post-deploy API/CDN route inventory does not match the canonical set.");
    }
    return finalRoutes;
  } catch (error) {
    for (const route of [...removed].reverse()) {
      await restoreRoute(route).catch(() => {});
      await delay(100);
    }
    for (const route of [...created].reverse()) {
      await deleteRoute(route).catch(() => {});
    }
    throw error;
  }
}

const [currentRoutes] = await Promise.all([
  getRoutes(),
  assertProductWorkersAndBuckets(),
  assertCompatibilityDomains(),
]);
assertKnownOwners(currentRoutes);
const plan = summarize(currentRoutes);

if (!APPLY) {
  console.log(JSON.stringify({
    mode: "dry-run",
    apiAndCdnRouteCount: routes.size,
    canonicalRoutes: plan.expected,
    legacyRoutesToDelete: plan.remove,
    rootGatewayPreserved: rootGatewayRoute,
    websiteRoutePreserved: requiredSiteRoute,
    existingObjectDomainsPreserved: ["cdn.afuchat.com → afuchat-media", "img.afuchat.com → afucloud-images"],
    dnsChanges: [],
    bucketOrObjectChanges: [],
  }));
} else {
  const finalRoutes = await reconcile(plan);
  console.log(JSON.stringify({
    mode: "deployed",
    apiAndCdnRouteCount: routes.size,
    canonicalRoutes: [...routes].map(([pattern, script]) => ({ pattern, script })),
    rootGatewayPreserved: rootGatewayRoute,
    deletedLegacyRoutes: plan.remove.map(({ pattern, script }) => ({ pattern, script })),
    websiteRoutePreserved: requiredSiteRoute,
    existingObjectDomainsPreserved: ["cdn.afuchat.com → afuchat-media", "img.afuchat.com → afucloud-images"],
    dnsChanges: [],
    bucketOrObjectChanges: [],
    finalScopedRouteCount: finalRoutes.filter(isProductHostRoute).length,
  }));
}
