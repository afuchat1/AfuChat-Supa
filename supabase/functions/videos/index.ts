const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function authedUserId(req: Request, supabaseUrl: string, serviceKey: string): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return null;
  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: serviceKey },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.id ?? null;
}

function publicUrlFor(storagePath: string, r2PublicBase: string): string {
  return `${r2PublicBase}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

const RENDITION_HEIGHTS = [360, 720, 1080];
const CODEC_ORDER: Record<string, number> = { av1: 0, h264: 1 };
const HEIGHT_PRIORITY: Record<number, number> = { 720: 0, 1080: 5, 360: 10 };
const PRIORITY_BY_CODEC: Record<string, number> = { h264: 10, av1: 50 };

function planRenditions(sourceHeight: number | null) {
  const heights = RENDITION_HEIGHTS.filter((h) => sourceHeight == null || h <= sourceHeight);
  const finalHeights = heights.length ? heights : [360];
  const plan: Array<{ codec: string; height: number; priority: number }> = [];
  for (const codec of ["h264", "av1"]) {
    for (const height of finalHeights) {
      plan.push({ codec, height, priority: PRIORITY_BY_CODEC[codec] + (HEIGHT_PRIORITY[height] ?? 20) });
    }
  }
  return plan;
}

function mimeFor(codec: string, container: string): string {
  if (container === "mp4") return codec === "av1" ? 'video/mp4; codecs="av01.0.05M.08"' : 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';
  if (container === "webm") return "video/webm";
  return "video/mp4";
}

async function getR2PublicBase(supabaseUrl: string, serviceKey: string): Promise<string> {
  const env = Deno.env.get("R2_PUBLIC_BASE_URL") || Deno.env.get("R2_DEV_PUBLIC_URL") || "";
  if (env) return env.replace(/\/+$/, "");
  const resp = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=key,value`, {
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
  if (!resp.ok) return "";
  const rows: { key: string; value: string }[] = await resp.json();
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return (s["R2_PUBLIC_BASE_URL"] || s["R2_DEV_PUBLIC_URL"] || "").replace(/\/+$/, "");
}

function buildManifest(asset: any, renditions: any[], r2PublicBase: string) {
  const sources = (renditions || [])
    .filter((r) => r.status === "ready" && r.storage_path)
    .sort((a, b) => {
      const ca = CODEC_ORDER[a.codec] ?? 9, cb = CODEC_ORDER[b.codec] ?? 9;
      return ca !== cb ? ca - cb : b.height - a.height;
    })
    .map((r) => ({
      codec: r.codec,
      container: r.container,
      height: r.height,
      width: r.width,
      bitrate_kbps: r.bitrate_kbps,
      mime: mimeFor(r.codec, r.container),
      url: publicUrlFor(r.storage_path, r2PublicBase),
    }));
  return {
    id: asset.id,
    status: asset.status,
    duration: asset.duration_seconds,
    width: asset.width,
    height: asset.height,
    poster: asset.poster_path ? publicUrlFor(asset.poster_path, r2PublicBase) : null,
    fallback_url: publicUrlFor(asset.source_path, r2PublicBase),
    sources,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Service not configured" }, 503);

  const dbHeaders = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const fnIdx = segments.findIndex((s) => s === "videos");
  const rest = fnIdx >= 0 ? segments.slice(fnIdx + 1) : segments;

  if (req.method === "POST" && rest.length === 0) {
    const userId = await authedUserId(req, supabaseUrl, serviceKey);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { source_path, post_id, duration, width, height, source_size_bytes, source_mime } = body || {};
    if (!source_path || typeof source_path !== "string") return json({ error: "source_path is required" }, 400);
    if (!source_path.startsWith(`${userId}/`)) return json({ error: "source_path is not owned by caller" }, 403);

    const assetResp = await fetch(`${supabaseUrl}/rest/v1/video_assets`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        owner_id: userId,
        post_id: post_id ?? null,
        source_path,
        source_size_bytes: source_size_bytes ?? null,
        source_mime: source_mime ?? null,
        duration_seconds: duration ?? null,
        width: width ?? null,
        height: height ?? null,
        status: "pending",
      }),
    });
    if (!assetResp.ok) return json({ error: "Insert failed" }, 500);
    const assets = await assetResp.json();
    const asset = Array.isArray(assets) ? assets[0] : assets;
    if (!asset?.id) return json({ error: "Insert failed" }, 500);

    const plan = planRenditions(height ?? null);
    const renditionRows = plan.map((p) => ({ asset_id: asset.id, codec: p.codec, container: "mp4", height: p.height, status: "pending" }));

    const renResp = await fetch(`${supabaseUrl}/rest/v1/video_renditions`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify(renditionRows),
    });
    if (!renResp.ok) return json({ error: "Rendition insert failed" }, 500);
    const renditions = await renResp.json();

    const jobRows = (Array.isArray(renditions) ? renditions : []).map((r: any) => ({
      asset_id: asset.id,
      rendition_id: r.id,
      codec: r.codec,
      height: r.height,
      priority: PRIORITY_BY_CODEC[r.codec] + (HEIGHT_PRIORITY[r.height] ?? 20),
      status: "queued",
    }));

    await fetch(`${supabaseUrl}/rest/v1/video_jobs`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify(jobRows),
    });

    if (post_id) {
      await fetch(`${supabaseUrl}/rest/v1/posts?id=eq.${post_id}&author_id=eq.${userId}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({ video_asset_id: asset.id }),
      });
    }

    return json({ id: asset.id, status: "pending", planned_renditions: plan.length }, 201);
  }

  const r2PublicBase = await getR2PublicBase(supabaseUrl, serviceKey);

  if (req.method === "GET" && rest[1] === "manifest") {
    const assetId = rest[0];
    const assetResp = await fetch(
      `${supabaseUrl}/rest/v1/video_assets?select=id,status,duration_seconds,width,height,poster_path,source_path&id=eq.${assetId}&limit=1`,
      { headers: dbHeaders },
    );
    if (!assetResp.ok) return json({ error: "Not found" }, 404);
    const assets = await assetResp.json();
    const asset = assets?.[0];
    if (!asset) return json({ error: "Not found" }, 404);

    const renResp = await fetch(
      `${supabaseUrl}/rest/v1/video_renditions?select=codec,container,height,width,bitrate_kbps,storage_path,status&asset_id=eq.${assetId}`,
      { headers: dbHeaders },
    );
    const renditions = renResp.ok ? await renResp.json() : [];
    return json(buildManifest(asset, renditions, r2PublicBase));
  }

  if (req.method === "GET" && rest[0] === "by-post" && rest[2] === "manifest") {
    const postId = rest[1];
    const postResp = await fetch(
      `${supabaseUrl}/rest/v1/posts?select=video_asset_id&id=eq.${postId}&limit=1`,
      { headers: dbHeaders },
    );
    if (!postResp.ok) return json({ error: "Not found" }, 404);
    const posts = await postResp.json();
    const assetId = posts?.[0]?.video_asset_id;
    if (!assetId) return json({ error: "No video asset for post" }, 404);

    const assetResp = await fetch(
      `${supabaseUrl}/rest/v1/video_assets?select=id,status,duration_seconds,width,height,poster_path,source_path&id=eq.${assetId}&limit=1`,
      { headers: dbHeaders },
    );
    const assets = assetResp.ok ? await assetResp.json() : [];
    const asset = assets?.[0];
    if (!asset) return json({ error: "Not found" }, 404);

    const renResp = await fetch(
      `${supabaseUrl}/rest/v1/video_renditions?select=codec,container,height,width,bitrate_kbps,storage_path,status&asset_id=eq.${assetId}`,
      { headers: dbHeaders },
    );
    const renditions = renResp.ok ? await renResp.json() : [];
    return json(buildManifest(asset, renditions, r2PublicBase));
  }

  if (req.method === "GET" && rest.length === 1) {
    const assetId = rest[0];
    const [assetResp, renResp] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/video_assets?select=id,status,duration_seconds,width,height,poster_path,source_path&id=eq.${assetId}&limit=1`, { headers: dbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/video_renditions?select=codec,container,height,width,bitrate_kbps,storage_path,status&asset_id=eq.${assetId}`, { headers: dbHeaders }),
    ]);
    const assets = assetResp.ok ? await assetResp.json() : [];
    const asset = assets?.[0];
    if (!asset) return json({ error: "Not found" }, 404);
    const renditions = renResp.ok ? await renResp.json() : [];
    return json({ asset, renditions });
  }

  return json({ error: "Not found" }, 404);
});
