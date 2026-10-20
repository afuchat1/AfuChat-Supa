// AfuSearch visual-image-search — traditional computer vision only.
// Computes a difference hash (dHash) from pixels and compares it with indexed public AfuChat images.
// No AI models, AI APIs, generated captions, or AI-generated search terms are used.

import { createClient } from "npm:@supabase/supabase-js@2";
import jpeg from "npm:jpeg-js@0.4.4";
import { PNG } from "npm:pngjs@7.0.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_INDEX_PER_REQUEST = 24;
const MAX_CANDIDATE_POSTS = 500;
const MAX_INDEX_ROWS = 5000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_DISTANCE = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function decodeBase64(value: string): Uint8Array {
  const raw = atob(value);
  if (raw.length > MAX_INPUT_BYTES) throw new Error("Image is too large. Choose an image under 8 MB.");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function decodePixels(bytes: Uint8Array, mimeType = ""): { data: Uint8Array; width: number; height: number } {
  const type = mimeType.toLowerCase();
  if (type.includes("png") || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
    const decoded = PNG.sync.read(bytes);
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }
  if (type.includes("jpeg") || type.includes("jpg") || (bytes[0] === 0xff && bytes[1] === 0xd8)) {
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }
  throw new Error("This image format is not supported yet. Choose a JPEG or PNG image.");
}

// 64-bit difference hash: sample a 9×8 grayscale grid and compare adjacent pixels.
function differenceHash(bytes: Uint8Array, mimeType = ""): string {
  const image = decodePixels(bytes, mimeType);
  if (!image.width || !image.height || image.width * image.height > 40_000_000) {
    throw new Error("Image dimensions are not supported.");
  }
  const gray = (x: number, y: number) => {
    const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / 9));
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / 8));
    const offset = (sy * image.width + sx) * 4;
    return 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
  };
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | (gray(x, y) > gray(x + 1, y) ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, "0");
}

function hammingDistance(left: string, right: string): number {
  let value = BigInt("0x" + left) ^ BigInt("0x" + right);
  let count = 0;
  while (value) {
    count++;
    value &= value - 1n;
  }
  return count;
}

function allowedImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "afuchat.com" ||
      host.endsWith(".afuchat.com") ||
      host.endsWith(".supabase.co")
    );
  } catch {
    return false;
  }
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  if (!allowedImageUrl(url)) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/jpeg") && !contentType.startsWith("image/png")) return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_IMAGE_BYTES) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
    return buffer;
  } catch {
    return null;
  }
}

async function verifyUser(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  return !error && Boolean(data.user);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Visual search is not configured." }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (!(await verifyUser(req, admin))) return json({ error: "Please sign in to search images." }, 401);

    const body = await req.json();
    if (typeof body.imageBase64 !== "string" || !body.imageBase64) {
      return json({ error: "Choose an image to search." }, 400);
    }
    const imageBytes = decodeBase64(body.imageBase64);
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const targetHash = differenceHash(imageBytes, mimeType);
    const sourceImageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";

    const { data: indexedRows, error: indexError } = await admin
      .from("visual_image_index")
      .select("image_url,post_id,perceptual_hash,indexed_at")
      .order("indexed_at", { ascending: false })
      .limit(MAX_INDEX_ROWS);
    if (indexError) {
      console.error("[visual-image-search] index query failed", indexError.message);
      return json({ error: "Visual search index is not ready. Apply the visual image index migration first." }, 503);
    }

    const indexed = new Map<string, { image_url: string; post_id: string; perceptual_hash: string; indexed_at?: string }>();
    for (const row of indexedRows ?? []) indexed.set(row.image_url, row);

    // Incrementally index public post images, so coverage grows without making each
    // search download the entire image library. Only AfuChat-owned HTTPS media URLs are fetched.
    const { data: posts, error: postsError } = await admin
      .from("posts")
      .select("id,content,article_title,image_url,created_at,visibility,post_images(image_url,display_order)")
      .or("visibility.eq.public,visibility.is.null")
      .order("created_at", { ascending: false })
      .limit(MAX_CANDIDATE_POSTS);
    if (postsError) {
      console.error("[visual-image-search] posts query failed", postsError.message);
      return json({ error: "Could not load public images for visual search." }, 502);
    }

    const imageOwners = new Map<string, { post_id: string }>();
    for (const post of posts ?? []) {
      const urls = [post.image_url, ...((post.post_images ?? []).map((item: { image_url?: string }) => item.image_url))];
      for (const url of urls) {
        if (allowedImageUrl(url) && !imageOwners.has(url)) imageOwners.set(url, { post_id: post.id });
      }
    }

    const pending = [...imageOwners.entries()]
      .filter(([url]) => !indexed.has(url))
      .slice(0, MAX_INDEX_PER_REQUEST);

    // Keep concurrent downloads bounded to avoid spiking the Edge Function.
    for (let offset = 0; offset < pending.length; offset += 4) {
      const batch = pending.slice(offset, offset + 4);
      const computed = await Promise.all(batch.map(async ([url, owner]) => {
        const bytes = await fetchImageBytes(url);
        if (!bytes) return null;
        try {
          const contentType = url.toLowerCase().split("?")[0].endsWith(".png") ? "image/png" : "image/jpeg";
          return {
            image_url: url,
            post_id: owner.post_id,
            perceptual_hash: differenceHash(bytes, contentType),
          };
        } catch {
          return null;
        }
      }));
      const valid = computed.filter((row): row is { image_url: string; post_id: string; perceptual_hash: string } => Boolean(row));
      if (valid.length) {
        const { error: upsertError } = await admin.from("visual_image_index").upsert(valid, { onConflict: "image_url" });
        if (upsertError) console.error("[visual-image-search] index write failed", upsertError.message);
        for (const row of valid) indexed.set(row.image_url, row);
      }
    }

    const bestByImage = new Map<string, { image_url: string; post_id: string; perceptual_hash: string; distance: number }>();
    for (const row of indexed.values()) {
      if (row.image_url === sourceImageUrl || !row.perceptual_hash) continue;
      const distance = hammingDistance(targetHash, row.perceptual_hash);
      if (distance <= MAX_DISTANCE) {
        bestByImage.set(row.image_url, { image_url: row.image_url, post_id: row.post_id, perceptual_hash: row.perceptual_hash, distance });
      }
    }

    const candidates = [...bestByImage.values()].sort((a, b) => a.distance - b.distance).slice(0, 30);
    const postIds = [...new Set(candidates.map((row) => row.post_id))];
    let postsById = new Map<string, any>();
    if (postIds.length) {
      const { data: matchedPosts, error: matchedError } = await admin
        .from("posts")
        .select("id,content,article_title,created_at,visibility,author_id")
        .in("id", postIds);
      if (matchedError) console.error("[visual-image-search] matched post lookup failed", matchedError.message);
      postsById = new Map((matchedPosts ?? [])
        .filter((post: any) => post.visibility === "public" || post.visibility == null)
        .map((post: any) => [post.id, post]));
    }

    const matches = candidates
      .filter((row) => postsById.has(row.post_id))
      .map((row) => {
        const post = postsById.get(row.post_id);
        return {
          postId: row.post_id,
          imageUrl: row.image_url,
          content: String(post.content ?? post.article_title ?? "").slice(0, 220),
          createdAt: post.created_at,
          distance: row.distance,
          similarity: Math.round((64 - row.distance) / 64 * 100),
        };
      })
      .slice(0, 12);

    return json({
      algorithm: "dhash",
      indexedThisRequest: pending.length,
      matches,
      message: matches.length
        ? "Matches are ranked by visual fingerprint similarity."
        : "No close visual matches found in the images indexed so far. The index grows as AfuSearch processes public images.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual search failed.";
    console.error("[visual-image-search] request failed", message);
    return json({ error: message }, 400);
  }
});
