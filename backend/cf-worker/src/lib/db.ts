// Lightweight Supabase REST API client for Cloudflare Workers
import type { Env } from "../types";

export type DbClient = ReturnType<typeof createDbClient>;

export function createDbClient(env: Env) {
  const baseUrl = `${env.SUPABASE_URL}/rest/v1`;
  const schema = env.SUPABASE_DB_SCHEMA ?? "afucloud";
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  };

  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    extraHeaders?: Record<string, string>,
    profileSchema = schema,
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...headers,
        "Accept-Profile": profileSchema,
        "Content-Profile": profileSchema,
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  return {
    // ── Users ──────────────────────────────────────────────────────────────
    async getUserByEmail(email: string) {
      const r = await request(`/profiles?email=ilike.${encodeURIComponent(email)}&limit=1`, "GET", undefined, undefined, "accounts");
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async getUserById(id: string) {
      const r = await request(`/profiles?user_id=eq.${id}&limit=1`, "GET", undefined, undefined, "accounts");
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async createUser(data: {
      user_id: string;
      email: string;
      name: string;
      email_verified?: boolean;
    }) {
      const r = await request("/profiles", "POST", data, { Prefer: "return=representation" }, "accounts");
      const rows = await r.json() as any[];
      return rows[0];
    },
    async updateUser(id: string, data: Record<string, unknown>) {
      const r = await request(`/profiles?user_id=eq.${id}`, "PATCH", data, { Prefer: "return=representation" }, "accounts");
      const rows = await r.json() as any[];
      return rows[0];
    },

    // ── Refresh Tokens ──────────────────────────────────────────────────────
    async getRefreshToken(tokenHash: string) {
      const r = await request(`/refresh_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async createRefreshToken(data: { user_id: string; token_hash: string; expires_at: string }) {
      const r = await request("/refresh_tokens", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async deleteRefreshToken(id: string) {
      await request(`/refresh_tokens?id=eq.${id}`, "DELETE");
    },
    async deleteRefreshTokenByHash(tokenHash: string) {
      await request(`/refresh_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}`, "DELETE");
    },
    async deleteRefreshTokensByUserId(userId: string) {
      await request(`/refresh_tokens?user_id=eq.${encodeURIComponent(userId)}`, "DELETE");
    },

    // ── Projects ────────────────────────────────────────────────────────────
    async getProjects(userId: string) {
      const r = await request(`/projects?user_id=eq.${userId}&order=created_at.desc`);
      return r.json() as Promise<any[]>;
    },
    async getProject(id: string, userId: string) {
      const r = await request(`/projects?id=eq.${id}&user_id=eq.${userId}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async createProject(data: { name: string; slug: string; description?: string; user_id: string }) {
      const r = await request("/projects", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async updateProject(id: string, data: Record<string, unknown>) {
      const r = await request(`/projects?id=eq.${id}`, "PATCH", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async deleteProject(id: string) {
      await request(`/projects?id=eq.${id}`, "DELETE");
    },

    // ── Images ──────────────────────────────────────────────────────────────
    async getImages(projectId: string, filters: Record<string, string> = {}) {
      let q = `/images?project_id=eq.${projectId}&deleted_at=is.null&order=created_at.desc`;
      if (filters.search) q += `&name=ilike.*${filters.search}*`;
      if (filters.format) q += `&format=eq.${filters.format}`;
      if (filters.album) q += `&album=eq.${filters.album}`;
      if (filters.favorite === "true") q += `&favorite=eq.true`;
      const limit = Math.min(200, parseInt(filters.limit ?? "50", 10) || 50);
      const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
      q += `&limit=${limit}&offset=${(page - 1) * limit}`;
      const r = await request(q, "GET", undefined, { Prefer: "count=exact" });
      const totalHeader = r.headers.get("Content-Range")?.split("/")[1];
      const rows = await r.json() as any[];
      return { images: rows, total: totalHeader ? parseInt(totalHeader, 10) : rows.length };
    },
    async getImage(id: string, projectId: string) {
      const r = await request(`/images?id=eq.${id}&project_id=eq.${projectId}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async getDeletedImages(projectId: string) {
      const r = await request(`/images?project_id=eq.${projectId}&deleted_at=not.is.null&order=deleted_at.desc`);
      return r.json() as Promise<any[]>;
    },
    async createImage(data: Record<string, unknown>) {
      const r = await request("/images", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async updateImage(id: string, data: Record<string, unknown>) {
      const r = await request(`/images?id=eq.${id}`, "PATCH", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async softDeleteImage(id: string) {
      const r = await request(`/images?id=eq.${id}`, "PATCH", { deleted_at: new Date().toISOString() }, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async restoreImage(id: string) {
      const r = await request(`/images?id=eq.${id}`, "PATCH", { deleted_at: null }, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async hardDeleteImage(id: string) {
      const r = await request(`/images?id=eq.${id}`, "DELETE", undefined, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async emptyTrash(projectId: string) {
      const r = await request(
        `/images?project_id=eq.${projectId}&deleted_at=not.is.null`,
        "DELETE",
        undefined,
        { Prefer: "return=representation" },
      );
      return r.json() as Promise<any[]>;
    },
    async getImageStats(projectId: string) {
      const rTotal = await request(`/images?project_id=eq.${projectId}&deleted_at=is.null&select=size,favorite`);
      const all = await rTotal.json() as any[];
      const rDel = await request(`/images?project_id=eq.${projectId}&deleted_at=not.is.null&select=id`);
      const deleted = await rDel.json() as any[];
      return {
        totalImages: all.length,
        storageUsed: all.reduce((s: number, r: any) => s + (r.size || 0), 0),
        favoriteImages: all.filter((r: any) => r.favorite).length,
        deletedImages: deleted.length,
        apiRequests: 0,
        bandwidth: 0,
      };
    },

    // ── API Keys ────────────────────────────────────────────────────────────
    async getApiKeys(projectId: string) {
      const r = await request(`/api_keys?project_id=eq.${projectId}&order=created_at.desc`);
      return r.json() as Promise<any[]>;
    },
    async createApiKey(data: Record<string, unknown>) {
      const r = await request("/api_keys", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async revokeApiKey(id: string, projectId: string) {
      await request(`/api_keys?id=eq.${id}&project_id=eq.${projectId}`, "DELETE");
    },
    async getApiKeyByHash(keyHash: string) {
      const r = await request(`/api_keys?key_hash=eq.${encodeURIComponent(keyHash)}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },

    // ── Personal Tokens ─────────────────────────────────────────────────────
    async getPersonalTokens(userId: string) {
      const r = await request(`/personal_tokens?user_id=eq.${userId}&order=created_at.desc`);
      return r.json() as Promise<any[]>;
    },
    async createPersonalToken(data: Record<string, unknown>) {
      const r = await request("/personal_tokens", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async revokePersonalToken(id: string, userId: string) {
      await request(`/personal_tokens?id=eq.${id}&user_id=eq.${userId}`, "PATCH", {
        revoked_at: new Date().toISOString(),
      });
    },

    // ── Webhooks ────────────────────────────────────────────────────────────
    async getWebhooks(projectId: string) {
      const r = await request(`/webhooks?project_id=eq.${projectId}&order=created_at.desc`);
      return r.json() as Promise<any[]>;
    },
    async createWebhook(data: Record<string, unknown>) {
      const r = await request("/webhooks", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async updateWebhook(id: string, projectId: string, data: Record<string, unknown>) {
      const r = await request(`/webhooks?id=eq.${id}&project_id=eq.${projectId}`, "PATCH", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async deleteWebhook(id: string, projectId: string) {
      await request(`/webhooks?id=eq.${id}&project_id=eq.${projectId}`, "DELETE");
    },

    // ── Domains and hostnames ────────────────────────────────────────────────
    async getDomains(userId: string) {
      const r = await request(`/domains?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`);
      return r.json() as Promise<any[]>;
    },
    async getDomain(id: string, userId: string) {
      const r = await request(`/domains?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async createDomain(data: Record<string, unknown>) {
      const r = await request("/domains", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async updateDomain(id: string, userId: string, data: Record<string, unknown>) {
      const r = await request(`/domains?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, "PATCH", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async deleteDomain(id: string, userId: string) {
      await request(`/domains?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, "DELETE");
    },
    async getHostnames(domainId: string, userId: string) {
      const r = await request(`/hostnames?domain_id=eq.${encodeURIComponent(domainId)}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`);
      return r.json() as Promise<any[]>;
    },
    async getHostname(id: string, domainId: string, userId: string) {
      const r = await request(`/hostnames?id=eq.${encodeURIComponent(id)}&domain_id=eq.${encodeURIComponent(domainId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async getHostnamesForCdn(userId: string, id?: string) {
      const idFilter = id ? `&id=eq.${encodeURIComponent(id)}` : "";
      const r = await request(`/hostnames?user_id=eq.${encodeURIComponent(userId)}${idFilter}&service=eq.cdn&limit=1`);
      return r.json() as Promise<any[]>;
    },
    async createHostname(data: Record<string, unknown>) {
      const r = await request("/hostnames", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async updateHostname(id: string, userId: string, data: Record<string, unknown>) {
      const r = await request(`/hostnames?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, "PATCH", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async deleteHostname(id: string, domainId: string, userId: string) {
      await request(`/hostnames?id=eq.${encodeURIComponent(id)}&domain_id=eq.${encodeURIComponent(domainId)}&user_id=eq.${encodeURIComponent(userId)}`, "DELETE");
    },

    // ── Storage containers and objects ────────────────────────────────────────
    async getStorageContainers(userId: string) {
      const r = await request(`/storage_containers?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`);
      return r.json() as Promise<any[]>;
    },
    async getStorageContainer(id: string, userId: string) {
      const r = await request(`/storage_containers?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async createStorageContainer(data: Record<string, unknown>) {
      const r = await request("/storage_containers", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async updateStorageContainer(id: string, userId: string, data: Record<string, unknown>) {
      const r = await request(`/storage_containers?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, "PATCH", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async deleteStorageContainer(id: string, userId: string) {
      await request(`/storage_containers?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, "DELETE");
    },
    async getStorageObjects(containerId: string, userId: string, prefix = "") {
      const filters = [
        `container_id=eq.${encodeURIComponent(containerId)}`,
        `user_id=eq.${encodeURIComponent(userId)}`,
        "order=is_folder.asc,name.asc",
      ];
      if (prefix) filters.push(`object_key=like.${encodeURIComponent(`${prefix.replace(/\/+$/, "")}/*`)}`);
      const r = await request(`/storage_objects?${filters.join("&")}`);
      return r.json() as Promise<any[]>;
    },
    async getStorageObject(id: string, containerId: string, userId: string) {
      const r = await request(`/storage_objects?id=eq.${encodeURIComponent(id)}&container_id=eq.${encodeURIComponent(containerId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async getStorageObjectByKey(key: string, containerId: string, userId: string) {
      const r = await request(`/storage_objects?object_key=eq.${encodeURIComponent(key)}&container_id=eq.${encodeURIComponent(containerId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async createStorageObject(data: Record<string, unknown>) {
      const r = await request("/storage_objects", "POST", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0];
    },
    async updateStorageObject(id: string, containerId: string, userId: string, data: Record<string, unknown>) {
      const r = await request(`/storage_objects?id=eq.${encodeURIComponent(id)}&container_id=eq.${encodeURIComponent(containerId)}&user_id=eq.${encodeURIComponent(userId)}`, "PATCH", data, { Prefer: "return=representation" });
      const rows = await r.json() as any[];
      return rows[0] ?? null;
    },
    async deleteStorageObject(id: string, containerId: string, userId: string) {
      await request(`/storage_objects?id=eq.${encodeURIComponent(id)}&container_id=eq.${encodeURIComponent(containerId)}&user_id=eq.${encodeURIComponent(userId)}`, "DELETE");
    },

    // ── Activity Logs ───────────────────────────────────────────────────────
    async getActivity(userId: string, limit = 50) {
      const r = await request(`/activity_logs?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`);
      return r.json() as Promise<any[]>;
    },
    async logActivity(data: {
      user_id: string;
      project_id?: string;
      action: string;
      resource: string;
      resource_id?: string;
      metadata?: unknown;
    }) {
      await request("/activity_logs", "POST", data).catch(() => {});
    },
  };
}
