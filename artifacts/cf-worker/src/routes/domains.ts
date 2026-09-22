import { Hono } from "hono";
import type { Env, AuthVariables } from "../types";
import { createDbClient } from "../lib/db";
import { requireAuth } from "../middleware/auth";

const domains = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
}

function isRootDomain(domain: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

function apiHostname(hostname: any, env: Env) {
  return {
    id: hostname.id,
    hostname: hostname.hostname,
    service: hostname.service,
    serviceId: hostname.service_id ?? null,
    status: hostname.status,
    sslStatus: hostname.ssl_status,
    dnsStatus: hostname.dns_status,
    dnsRecord: {
      type: "CNAME",
      name: hostname.hostname,
      value: env.AFU_CDN_TARGET ?? "cdn.afucloud.dev",
    },
    createdAt: hostname.created_at,
  };
}

function apiDomain(domain: any, hostnames: any[], env: Env) {
  return {
    id: domain.id,
    hostname: domain.hostname,
    verificationStatus: domain.verification_status,
    sslStatus: domain.ssl_status,
    dnsStatus: domain.dns_status,
    verifiedAt: domain.verified_at ?? null,
    dnsRecord: {
      type: "TXT",
      name: "_afu-verification",
      fqdn: `_afu-verification.${domain.hostname}`,
      value: domain.verification_token,
    },
    hostnames: hostnames.map(hostname => apiHostname(hostname, env)),
    createdAt: domain.created_at,
  };
}

async function resolveTxt(name: string): Promise<string[]> {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", "TXT");
  const response = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!response.ok) throw new Error("DNS lookup failed");
  const dns = await response.json() as { Answer?: Array<{ data?: string }> };
  return (dns.Answer ?? []).map(answer => (answer.data ?? "").replace(/^"|"$/g, "").replace(/\\"/g, '"'));
}

async function resolveCname(name: string): Promise<string[]> {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", "CNAME");
  const response = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!response.ok) throw new Error("DNS lookup failed");
  const dns = await response.json() as { Answer?: Array<{ data?: string }> };
  return (dns.Answer ?? []).map(answer => (answer.data ?? "").replace(/\.$/, ""));
}

async function domainResponse(db: ReturnType<typeof createDbClient>, id: string, userId: string, env: Env) {
  const domain = await db.getDomain(id, userId);
  if (!domain) return null;
  return apiDomain(domain, await db.getHostnames(id, userId), env);
}

domains.get("/", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const list = await db.getDomains(c.get("userId"));
  return c.json(await Promise.all(list.map(domain => domainResponse(db, domain.id, c.get("userId"), c.env))));
});

domains.post("/", requireAuth, async (c) => {
  const { hostname: rawHostname } = await c.req.json().catch(() => ({}));
  const hostname = normalizeDomain(String(rawHostname ?? ""));
  if (!isRootDomain(hostname)) return c.json({ error: "Enter a valid root domain, such as example.com" }, 400);
  const db = createDbClient(c.env);
  const existing = (await db.getDomains(c.get("userId"))).find(domain => domain.hostname === hostname);
  if (existing) return c.json({ error: "That domain is already connected to your account" }, 409);
  const domain = await db.createDomain({
    user_id: c.get("userId"),
    hostname,
    verification_token: `afu_verify_${crypto.randomUUID().replace(/-/g, "")}`,
  });
  return c.json(apiDomain(domain, [], c.env), 201);
});

domains.post("/:id/verify", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const domain = await db.getDomain(c.req.param("id"), c.get("userId"));
  if (!domain) return c.json({ error: "Domain not found" }, 404);
  let values: string[];
  try {
    values = await resolveTxt(`_afu-verification.${domain.hostname}`);
  } catch {
    return c.json({ error: "DNS verification service is temporarily unavailable" }, 502);
  }
  if (!values.includes(domain.verification_token)) {
    return c.json({
      error: "Verification record not found",
      dnsRecord: { type: "TXT", name: "_afu-verification", fqdn: `_afu-verification.${domain.hostname}`, value: domain.verification_token },
    }, 422);
  }
  const updated = await db.updateDomain(domain.id, c.get("userId"), {
    verification_status: "verified",
    ssl_status: "pending",
    dns_status: "configured",
    verified_at: new Date().toISOString(),
  });
  return c.json(apiDomain(updated, await db.getHostnames(domain.id, c.get("userId")), c.env));
});

domains.get("/:id", requireAuth, async (c) => {
  const result = await domainResponse(createDbClient(c.env), c.req.param("id"), c.get("userId"), c.env);
  return result ? c.json(result) : c.json({ error: "Domain not found" }, 404);
});

domains.post("/:id/hostnames", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const domain = await db.getDomain(c.req.param("id"), c.get("userId"));
  if (!domain) return c.json({ error: "Domain not found" }, 404);
  if (domain.verification_status !== "verified") return c.json({ error: "Verify the root domain before adding hostnames" }, 409);
  const body = await c.req.json().catch(() => ({}));
  const label = String(body.label ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
    return c.json({ error: "Enter a valid hostname label, such as cdn or www" }, 400);
  }
  const hostname = `${label}.${domain.hostname}`;
  const existing = (await db.getHostnames(domain.id, c.get("userId"))).find(item => item.hostname === hostname);
  if (existing) return c.json({ error: "That hostname already exists" }, 409);
  const created = await db.createHostname({
    domain_id: domain.id,
    user_id: c.get("userId"),
    hostname,
    service: String(body.service ?? "unconnected"),
  });
  return c.json(apiHostname(created, c.env), 201);
});

domains.post("/:domainId/hostnames/:hostnameId/verify", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const domain = await db.getDomain(c.req.param("domainId"), c.get("userId"));
  if (!domain) return c.json({ error: "Domain not found" }, 404);
  const hostname = await db.getHostname(c.req.param("hostnameId"), domain.id, c.get("userId"));
  if (!hostname) return c.json({ error: "Hostname not found" }, 404);
  let values: string[];
  try {
    values = await resolveCname(hostname.hostname);
  } catch {
    return c.json({ error: "DNS verification service is temporarily unavailable" }, 502);
  }
  const expected = (c.env.AFU_CDN_TARGET ?? "cdn.afucloud.dev").replace(/\.$/, "");
  if (!values.some(value => value === expected)) {
    return c.json({ error: "CNAME record not found", dnsRecord: { type: "CNAME", name: hostname.hostname, value: expected } }, 422);
  }
  const updated = await db.updateHostname(hostname.id, c.get("userId"), {
    status: "active",
    ssl_status: "active",
    dns_status: "configured",
  });
  return c.json(apiHostname(updated, c.env));
});

domains.patch("/:domainId/hostnames/:hostnameId", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const domain = await db.getDomain(c.req.param("domainId"), c.get("userId"));
  if (!domain) return c.json({ error: "Domain not found" }, 404);
  const hostname = await db.getHostname(c.req.param("hostnameId"), domain.id, c.get("userId"));
  if (!hostname) return c.json({ error: "Hostname not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.service !== undefined) updates.service = body.service;
  if (body.serviceId !== undefined) updates.service_id = body.serviceId || null;
  const updated = await db.updateHostname(hostname.id, c.get("userId"), updates);
  return c.json(apiHostname(updated, c.env));
});

domains.delete("/:domainId/hostnames/:hostnameId", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const domain = await db.getDomain(c.req.param("domainId"), c.get("userId"));
  if (!domain) return c.json({ error: "Domain not found" }, 404);
  const hostname = await db.getHostname(c.req.param("hostnameId"), domain.id, c.get("userId"));
  if (!hostname) return c.json({ error: "Hostname not found" }, 404);
  await db.deleteHostname(hostname.id, domain.id, c.get("userId"));
  return c.json({ message: "Hostname removed" });
});

domains.delete("/:id", requireAuth, async (c) => {
  const db = createDbClient(c.env);
  const domain = await db.getDomain(c.req.param("id"), c.get("userId"));
  if (!domain) return c.json({ error: "Domain not found" }, 404);
  const hostnames = await db.getHostnames(domain.id, c.get("userId"));
  const containers = await db.getStorageContainers(c.get("userId"));
  if (containers.some(container => hostnames.some(hostname => hostname.id === container.cdn_hostname_id))) {
    return c.json({ error: "Disconnect this domain from its storage containers before removing it" }, 409);
  }
  await db.deleteDomain(domain.id, c.get("userId"));
  return c.json({ message: "Domain removed" });
});

export default domains;