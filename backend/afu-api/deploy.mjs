#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACCOUNT_ID = "42e79186125e8ff83e51f15816e074de";
const ZONE_ID = "d3eb877a0ae2af4dbb94d8e6b4310af9";
const HOSTNAME = "api.afuchat.com";
const WORKER_NAME = "afu-api";
const API = "https://api.cloudflare.com/client/v4";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = await readFile(path.join(ROOT, "src/index.mjs"), "utf8");
const APPLY = process.argv.includes("--apply");
const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!TOKEN) throw new Error("CLOUDFLARE_API_TOKEN is required.");

const SERVICES = {
  AFUAUTH_API: "afuauth-api",
  AFUCHAT_API: "afuchat-api",
  AFUCLOUD_API: "afucloud-api",
  AFUAI_API: "afuai-api",
  AFUADS_API: "afuads-api",
  AFUMAIL_API: "afumail-api",
};

const CURRENT_ROUTE_OWNERS = {
  "api.afuchat.com/": "afuauth-api",
  "api.afuchat.com/v1/auth/*": "afuauth-api",
  "api.afuchat.com/v1/auth-resolve-identifier": "afuauth-api",
  "api.afuchat.com/chat/*": "afuchat-api",
  "api.afuchat.com/v1/chat/*": "afuchat-api",
  "api.afuchat.com/v1/storage*": "afuchat-api",
  "api.afuchat.com/v1/cloud/*": "afucloud-api",
  "api.afuchat.com/afucloud/*": "afucloud-api",
  "api.afuchat.com/v1/ai/*": "afuai-api",
  "api.afuchat.com/v1/ads/*": "afuads-api",
  "api.afuchat.com/v1/mail/*": "afumail-api",
};

const PLACEHOLDER_DNS = {
  type: "A",
  name: HOSTNAME,
  content: "192.0.2.1",
  ttl: 1,
  proxied: true,
  comment: "API hostname uses Cloudflare Worker routes; override wildcard website origin",
};

const apiHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/json",
};

function safeMessages(data) {
  return (Array.isArray(data?.errors) ? data.errors : [])
    .map((error) => error.message)
    .filter(Boolean)
    .slice(0, 3);
}

async function cloudflare(pathname, options = {}, label = "Cloudflare API request") {
  const headers = new Headers(options.headers);
  headers.set("Authorization", apiHeaders.Authorization);
  headers.set("Accept", "application/json");

  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers,
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const messages = safeMessages(data);
    throw new Error(
      `${label} failed with HTTP ${response.status}` +
        (messages.length ? `: ${messages.join("; ")}` : ""),
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

async function listDomains() {
  const result = await cloudflare(
    `/accounts/${ACCOUNT_ID}/workers/domains?per_page=100`,
    {},
    "List Worker custom domains",
  );
  return Array.isArray(result.result) ? result.result : [];
}

async function listDnsRecords() {
  const result = await cloudflare(
    `/zones/${ZONE_ID}/dns_records?name=${encodeURIComponent(HOSTNAME)}&per_page=100`,
    {},
    "List API hostname DNS records",
  );
  return Array.isArray(result.result) ? result.result : [];
}

function apiRoutes(routes) {
  return routes.filter((route) => route.pattern.startsWith(`${HOSTNAME}/`));
}

function assertRouteInventory(routes, domainIsOwned) {
  const hostRoutes = apiRoutes(routes);
  const seen = new Set();
  for (const route of hostRoutes) {
    const expectedOwner = CURRENT_ROUTE_OWNERS[route.pattern];
    if (!expectedOwner || seen.has(route.pattern)) {
      throw new Error(`Unexpected or duplicate API hostname route: ${route.pattern}`);
    }
    seen.add(route.pattern);
    if (route.script !== expectedOwner && route.script !== WORKER_NAME) {
      throw new Error(
        `Route ${route.pattern} is owned by ${route.script || "an unknown handler"}; refusing to overwrite it.`,
      );
    }
  }

  if (!domainIsOwned) {
    for (const pattern of Object.keys(CURRENT_ROUTE_OWNERS)) {
      if (!seen.has(pattern)) {
        throw new Error(`Expected API hostname route is missing: ${pattern}`);
      }
    }
  }
  return hostRoutes;
}

function assertBindings(settings) {
  const bindings = settings.result?.bindings || [];
  for (const [name, service] of Object.entries(SERVICES)) {
    const binding = bindings.find(
      (item) =>
        item.type === "service" &&
        item.name === name &&
        item.service === service &&
        item.environment === "production",
    );
    if (!binding) throw new Error(`The deployed ${WORKER_NAME} is missing ${name} → ${service}.`);
  }
}

async function uploadWorker() {
  const metadata = {
    main_module: "index.mjs",
    compatibility_date: "2026-10-06",
    workers_dev: false,
    preview_urls: false,
    bindings: Object.entries(SERVICES).map(([name, service]) => ({
      type: "service",
      name,
      service,
      environment: "production",
    })),
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
  assertBindings(settings);
}

async function setRoute(route, script) {
  await cloudflare(
    `/zones/${ZONE_ID}/workers/routes/${route.id}`,
    {
      method: "PUT",
      body: { pattern: route.pattern, script },
    },
    `Route ${route.pattern} to ${script}`,
  );
}

async function restoreRoutes(originalRoutes) {
  let current = await listRoutes();
  for (const original of originalRoutes) {
    const existing = current.find((route) => route.pattern === original.pattern);
    if (existing) {
      if (existing.script !== original.script) {
        await setRoute(existing, original.script);
      }
    } else {
      await cloudflare(
        `/zones/${ZONE_ID}/workers/routes`,
        {
          method: "POST",
          body: { pattern: original.pattern, script: original.script },
        },
        `Restore route ${original.pattern}`,
      );
    }
    current = await listRoutes();
  }
}

async function deleteApiRoutes(routes) {
  for (const route of routes) {
    await cloudflare(
      `/zones/${ZONE_ID}/workers/routes/${route.id}`,
      { method: "DELETE" },
      `Remove API hostname route ${route.pattern}`,
    );
  }
}

async function ensurePlaceholderDns() {
  const current = await listDnsRecords();
  const placeholder = current.find(
    (record) =>
      record.type === PLACEHOLDER_DNS.type &&
      record.content === PLACEHOLDER_DNS.content &&
      record.proxied === true,
  );
  if (placeholder) return;
  if (current.length) {
    throw new Error("Cannot restore the original API DNS record because another exact record exists.");
  }
  await cloudflare(
    `/zones/${ZONE_ID}/dns_records`,
    { method: "POST", body: PLACEHOLDER_DNS },
    "Restore the original fail-closed API DNS record",
  );
}

async function readProbe(url) {
  const response = await fetch(url, { redirect: "manual" });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON output is rejected by each probe's assertion below.
  }
  return { status: response.status, body, text };
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
  passed.push(
    await assertProbe(
      "/",
      ({ status, body }) =>
        status === 200 && body?.worker === "afuauth-api",
      "API root → AfuAuth",
    ),
  );
  passed.push(
    await assertProbe(
      "/v1/auth/healthz",
      ({ status, body }) => status === 200 && body?.worker === "afuauth-api",
      "AfuAuth namespace",
    ),
  );
  passed.push(
    await assertProbe(
      "/v1/chat/healthz",
      ({ status, body }) => status === 200 && body?.product === "afuchat",
      "AfuChat namespace",
    ),
  );
  passed.push(
    await assertProbe(
      "/chat/v1/storage/usage",
      ({ status, body }) => status === 401 && body?.error === "Authentication required",
      "AfuChat compatibility namespace",
    ),
  );
  passed.push(
    await assertProbe(
      "/v1/chat/storage/usage",
      ({ status, body }) => status === 401 && body?.error === "Authentication required",
      "AfuChat storage namespace",
    ),
  );
  passed.push(
    await assertProbe(
      "/v1/storage/usage",
      ({ status, body }) => status === 401 && body?.error === "Authentication required",
      "AfuChat legacy storage compatibility",
    ),
  );
  passed.push(
    await assertProbe(
      "/chat/rest/v1/profiles?select=id&limit=0",
      ({ status, body }) => status === 200 && Array.isArray(body) && body.length === 0,
      "Read-only Supabase compatibility query",
    ),
  );
  passed.push(
    await assertProbe(
      "/v1/cloud/healthz",
      ({ status, body }) =>
        status === 404 &&
        body?.path === "/v1/cloud/healthz" &&
        body?.api_version === "v1",
      "AfuCloud namespace → existing Worker response",
    ),
  );
  passed.push(
    await assertProbe(
      "/v1/ai/healthz",
      ({ status, body }) =>
        (status === 200 || status === 503) && body?.worker === "afuai-api",
      "AfuAI namespace → existing Worker",
    ),
  );
  passed.push(
    await assertProbe(
      "/v1/ads/healthz",
      ({ status, body }) => status === 200 && body?.worker === "afuads-api",
      "AfuAds namespace",
    ),
  );
  passed.push(
    await assertProbe(
      "/v1/mail/healthz",
      ({ status, body }) => status === 200 && body?.worker === "afumail-api",
      "AfuMail namespace",
    ),
  );
  passed.push(
    await assertProbe(
      "/__afu_api_unassigned_probe__",
      ({ status, body }) =>
        status === 404 && body?.worker === WORKER_NAME,
      "Unknown API path → gateway 404",
    ),
  );

  const cdn = await readProbe("https://cdn.afuchat.com/chat/__deployment_probe__");
  if (cdn.status !== 400 || cdn.body?.error !== "Invalid storage key") {
    throw new Error("The existing AfuChat CDN route changed unexpectedly.");
  }
  passed.push("AfuChat CDN path remains on its existing Worker");
  return passed;
}

async function verifyOwnedDomain() {
  const domains = await listDomains();
  const domain = domains.find((item) => item.hostname === HOSTNAME);
  if (!domain || domain.service !== WORKER_NAME || domain.zone_id !== ZONE_ID) {
    throw new Error(`${HOSTNAME} is not attached to ${WORKER_NAME}.`);
  }

  const routes = apiRoutes(await listRoutes());
  if (routes.length) {
    throw new Error(`${HOSTNAME} still has ${routes.length} path-based Worker routes.`);
  }

  const cdnRoute = (await listRoutes()).find(
    (route) =>
      route.pattern === "cdn.afuchat.com/chat/*" &&
      route.script === "afuchat-api",
  );
  if (!cdnRoute) throw new Error("The existing AfuChat CDN Worker route was not preserved.");

  const dns = await listDnsRecords();
  if (!dns.length) throw new Error("Cloudflare did not provision DNS for the Worker custom domain.");
  return { domain, dns: dns.map(({ type, name, content, proxied }) => ({ type, name, content, proxied })) };
}

async function deploy() {
  const scripts = await listScripts();
  for (const service of Object.values(SERVICES)) {
    if (!scripts.has(service)) throw new Error(`The current product Worker ${service} is missing.`);
  }
  const [allRoutes, domains, dns] = await Promise.all([
    listRoutes(),
    listDomains(),
    listDnsRecords(),
  ]);
  const existingDomain = domains.find((item) => item.hostname === HOSTNAME) || null;
  if (existingDomain && existingDomain.service !== WORKER_NAME) {
    throw new Error(`${HOSTNAME} is already owned by ${existingDomain.service}; refusing to replace it.`);
  }
  const originalRoutes = assertRouteInventory(apiRoutes(allRoutes), Boolean(existingDomain));
  if (!existingDomain) {
    const hasExpectedDns = dns.some(
      (record) =>
        record.type === PLACEHOLDER_DNS.type &&
        record.content === PLACEHOLDER_DNS.content &&
        record.proxied === true,
    );
    if (!hasExpectedDns) {
      throw new Error("The expected fail-closed API DNS record changed; refusing the ownership transfer.");
    }
  }

  const plan = {
    mode: APPLY ? "apply" : "dry-run",
    worker: WORKER_NAME,
    customDomain: existingDomain
      ? "keep"
      : "attach api.afuchat.com to afu-api",
    namespaceRoutes: originalRoutes.map((route) => ({
      pattern: route.pattern,
      from: route.script,
      to: WORKER_NAME,
    })),
    serviceBindings: SERVICES,
    removePathRoutesAfterDomainAttach: originalRoutes.length,
    productWorkersRedeployed: [],
    productDataChanged: false,
  };
  if (!APPLY) {
    console.log(JSON.stringify(plan));
    return;
  }

  let createdDomain = false;
  try {
    await uploadWorker();

    const liveRoutes = await listRoutes();
    const routesToTransfer = apiRoutes(liveRoutes);
    for (const route of routesToTransfer) {
      if (route.script !== WORKER_NAME) await setRoute(route, WORKER_NAME);
    }

    if (!existingDomain) {
      const attached = await cloudflare(
        `/accounts/${ACCOUNT_ID}/workers/domains`,
        {
          method: "PUT",
          body: {
            hostname: HOSTNAME,
            service: WORKER_NAME,
            zone_id: ZONE_ID,
          },
        },
        `Attach ${HOSTNAME} to ${WORKER_NAME}`,
      );
      createdDomain = true;
      if (!attached.result?.id) {
        throw new Error("Cloudflare did not return the custom-domain identifier.");
      }
    }

    const domainNow = (await listDomains()).find((item) => item.hostname === HOSTNAME);
    if (!domainNow || domainNow.service !== WORKER_NAME || domainNow.zone_id !== ZONE_ID) {
      throw new Error(`${HOSTNAME} did not become owned by ${WORKER_NAME}.`);
    }

    const beforeCleanupSmokeTests = await verifyPublicRouting();

    await deleteApiRoutes(apiRoutes(await listRoutes()));
    const smokeTests = await verifyPublicRouting();
    const ownership = await verifyOwnedDomain();

    console.log(
      JSON.stringify({
        mode: "deployed",
        worker: WORKER_NAME,
        customDomain: {
          hostname: ownership.domain.hostname,
          service: ownership.domain.service,
          environment: ownership.domain.environment,
        },
        dns: ownership.dns,
        serviceBindings: SERVICES,
        removedApiRouteCount: originalRoutes.length,
        productWorkersRedeployed: [],
        productDataChanged: false,
        preCleanupSmokeTests: beforeCleanupSmokeTests,
        smokeTests,
      }),
    );
  } catch (error) {
    const rollbackErrors = [];
    if (!existingDomain) {
      try {
        const domainsNow = await listDomains();
        const domainNow = domainsNow.find(
          (item) => item.hostname === HOSTNAME && item.service === WORKER_NAME,
        );
        if (domainNow?.id) {
          await cloudflare(
            `/accounts/${ACCOUNT_ID}/workers/domains/${domainNow.id}`,
            { method: "DELETE" },
            `Detach ${HOSTNAME} during rollback`,
          );
          createdDomain = true;
        }
      } catch (rollbackError) {
        rollbackErrors.push(`domain rollback: ${rollbackError.message}`);
      }
    }

    try {
      if (createdDomain && dns.length) {
        const dnsNow = await listDnsRecords();
        for (const record of dnsNow) {
          const wasPresent = dns.some((original) => original.id === record.id);
          if (!wasPresent) {
            await cloudflare(
              `/zones/${ZONE_ID}/dns_records/${record.id}`,
              { method: "DELETE" },
              "Remove DNS record created during custom-domain rollback",
            );
          }
        }
        await ensurePlaceholderDns();
      }
    } catch (rollbackError) {
      rollbackErrors.push(`DNS rollback: ${rollbackError.message}`);
    }

    try {
      await restoreRoutes(originalRoutes);
    } catch (rollbackError) {
      rollbackErrors.push(`route rollback: ${rollbackError.message}`);
    }

    if (rollbackErrors.length) {
      throw new Error(
        `${error.message}. Rollback was incomplete: ${rollbackErrors.join("; ")}`,
      );
    }
    throw error;
  }
}

await deploy();
